/**
 * Radar.exe's grafiske opstart.
 *
 * Programmet har intet konsolvindue. I stedet aabner det en side i brugerens
 * egen browser (`/start/`), hvor man vaelger centrum paa et kort, ser kortet
 * blive hentet og til sidst faar en QR-kode til admin og en knap til skaermen.
 *
 * To servere deler siden:
 *
 *  - opsaetningsserveren (node:http, kun foerste gang): tager imod centrum og
 *    henter kortet. Lukkes, naar alt er klart
 *  - den rigtige server (Fastify): har de samme ruter, nu med `tilstand: klar`,
 *    og knapper til skaermen, nyt centrum og at stoppe radaren
 *
 * Siden spoerger kun `/api/opsaetning/info` og tegner det, den faar - ogsaa
 * naar radaren skifter fra den ene server til den anden.
 *
 * Alle ruterne svarer kun til maskinen selv. Admin-adgangskoden staar i
 * svaret, og den maa ikke kunne hentes af andre paa nettet.
 */

import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as lavNetserver } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hentKort, harKortTil } from './kort.js';
import {
  gemValg,
  laesValg,
  nytValg,
  ryddGammelNat,
  saetCentrum,
  STANDARD_PORT,
  type Radarvalg,
} from './opsaetning.js';
import { aabnSkaerm, adminInfo, type Admininfo } from './visning.js';

export type Tilstand = 'opsaetning' | 'arbejder' | 'klar';

export interface Info {
  readonly tilstand: Tilstand;
  readonly valg: { readonly lat: number; readonly lon: number; readonly navn: string } | null;
  /** 0-100 mens kortet hentes, ellers null. */
  readonly fremdrift: number | null;
  readonly besked: string;
  readonly fejl: string | null;
  /** Kortet kunne ikke hentes, men man kan fortsaette med et noedgitter. */
  readonly kanFortsaette: boolean;
  readonly harKort: boolean;
  readonly admin: Admininfo | null;
  readonly port: number;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Kommer anmodningen fra maskinen selv? */
export const erLokal = (adresse: string | undefined): boolean =>
  adresse !== undefined && LOOPBACK.has(adresse);

const offentligtValg = (v: Radarvalg | null): Info['valg'] =>
  v ? { lat: v.lat, lon: v.lon, navn: v.navn } : null;

// ---------------------------------------------------------------- port og enkelt instans

/** Er porten fri? */
const erLedig = (port: number): Promise<boolean> =>
  new Promise((klar) => {
    const s = lavNetserver();
    s.once('error', () => klar(false));
    s.once('listening', () => s.close(() => klar(true)));
    s.listen(port, '0.0.0.0');
  });

/** Kører der allerede en radar paa porten? Saa skal der ikke startes en til. */
export const koererAllerede = async (port: number): Promise<boolean> => {
  try {
    const svar = await fetch(`http://127.0.0.1:${port}/api/opsaetning/info`, {
      signal: AbortSignal.timeout(900),
    });
    if (!svar.ok) return false;
    const krop = (await svar.json()) as { tilstand?: unknown };
    return typeof krop.tilstand === 'string';
  } catch {
    return false;
  }
};

/** Foerste ledige port fra `start`. Er en anden radar paa en af dem, returneres null. */
export const findPort = async (start: number): Promise<number | null> => {
  for (let p = start; p < start + 10; p += 1) {
    if (await koererAllerede(p)) return null;
    if (await erLedig(p)) return p;
  }
  throw new Error(`Ingen ledig port mellem ${start} og ${start + 9}.`);
};

// ---------------------------------------------------------------- opsaetningsjob

export interface Opsaetningsjob {
  info(): Info;
  /** Gemmer centrum og begynder at hente kortet. */
  start(input: { lat: number; lon: number; navn: string }): void;
  /** Kortet kunne ikke hentes; kør videre med et noedgitter. */
  fortsaetUdenKort(): void;
  /** Opfyldes med det valg, radaren skal startes med. */
  readonly faerdig: Promise<Radarvalg>;
}

/** Gyldigt koordinat? Siden tolker selv det, brugeren indsaetter. */
const gyldig = (lat: unknown, lon: unknown): lat is number =>
  typeof lat === 'number' &&
  typeof lon === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lon) <= 180;

export const lavOpsaetningsjob = (rod: string, port: number): Opsaetningsjob => {
  let tilstand: Tilstand = 'opsaetning';
  let valg: Radarvalg | null = null;
  let fremdrift: number | null = null;
  let besked = '';
  let fejl: string | null = null;
  let kanFortsaette = false;
  let harKort = false;
  let klar!: (v: Radarvalg) => void;
  const faerdig = new Promise<Radarvalg>((r) => {
    klar = r;
  });

  const kor = async (input: { lat: number; lon: number; navn: string }): Promise<void> => {
    tilstand = 'arbejder';
    fejl = null;
    kanFortsaette = false;
    fremdrift = 0;
    besked = 'Gemmer centrum ...';

    // Samme adgangskode som foer, saa en QR-kode paa telefonen stadig virker.
    const gammel = await laesValg(rod);
    const nyt = nytValg({ lat: input.lat, lon: input.lon }, input.navn, port);
    valg = gammel ? { ...nyt, token: gammel.token } : nyt;
    await gemValg(rod, valg);
    await saetCentrum(rod, valg);
    await ryddGammelNat(rod);

    besked = 'Henter kortet. Det kræver internet og tager et par minutter.';
    harKort = await hentKort(rod, valg, (p) => {
      fremdrift = p;
    });

    if (harKort || (await harKortTil(rod, valg))) {
      fremdrift = 100;
      besked = 'Kortet er klar. Starter radaren ...';
      // Et øjeblik, så siden når at vise 100 %.
      setTimeout(() => klar(valg as Radarvalg), 700);
      return;
    }

    tilstand = 'opsaetning';
    fremdrift = null;
    kanFortsaette = true;
    besked = '';
    fejl =
      'Kortet kunne ikke hentes. Tjek, at PC\'en har internet, og prøv igen. ' +
      'Du kan også fortsætte uden kort: radaren viser så et gitter i stedet.';
  };

  return {
    faerdig,
    info: () => ({
      tilstand,
      valg: offentligtValg(valg),
      fremdrift,
      besked,
      fejl,
      kanFortsaette,
      harKort,
      admin: null,
      port,
    }),
    start: (input) => {
      if (tilstand === 'arbejder') return;
      if (!gyldig(input.lat, input.lon)) {
        fejl = 'Koordinatet er ikke gyldigt.';
        return;
      }
      void kor(input).catch((e: unknown) => {
        tilstand = 'opsaetning';
        fremdrift = null;
        kanFortsaette = false;
        fejl = `Det mislykkedes: ${(e as Error).message}`;
      });
    },
    fortsaetUdenKort: () => {
      if (valg && kanFortsaette) {
        kanFortsaette = false;
        tilstand = 'arbejder';
        besked = 'Starter radaren uden kort ...';
        klar(valg);
      }
    },
  };
};

// ---------------------------------------------------------------- opsaetningsserver

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const svarJson = (svar: ServerResponse, kode: number, krop: unknown): void => {
  svar.writeHead(kode, { 'Content-Type': MIME['.json'] ?? 'application/json', 'Cache-Control': 'no-store' });
  svar.end(JSON.stringify(krop));
};

const laesKrop = (req: IncomingMessage): Promise<unknown> =>
  new Promise((klar) => {
    let tekst = '';
    req.on('data', (bid: Buffer) => {
      tekst += bid.toString('utf8');
      if (tekst.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        klar(tekst ? JSON.parse(tekst) : {});
      } catch {
        klar({});
      }
    });
    req.on('error', () => klar({}));
  });

const sendFil = async (rod: string, sti: string, svar: ServerResponse): Promise<void> => {
  const mappe = resolve(rod, 'setup');
  const onsket = normalize(sti === '' || sti.endsWith('/') ? `${sti}index.html` : sti);
  const fuld = resolve(mappe, `.${onsket.startsWith('/') ? onsket : `/${onsket}`}`);
  // Aldrig uden for setup-mappen.
  if (!fuld.startsWith(mappe)) {
    svar.writeHead(404).end();
    return;
  }
  try {
    const info = await stat(fuld);
    if (!info.isFile()) throw new Error('ikke en fil');
    svar.writeHead(200, {
      'Content-Type': MIME[extname(fuld).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(fuld).pipe(svar);
  } catch {
    svar.writeHead(404).end();
  }
};

export const startOpsaetningsserver = async (
  rod: string,
  port: number,
  job: Opsaetningsjob,
): Promise<{ luk(): Promise<void> }> => {
  const server: Server = createServer((req, svar) => {
    void (async () => {
      if (!erLokal(req.socket.remoteAddress)) {
        svar.writeHead(403).end();
        return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const sti = url.pathname;

      if (req.method === 'GET' && sti === '/') {
        svar.writeHead(302, { Location: '/start/' }).end();
      } else if (req.method === 'GET' && sti === '/api/opsaetning/info') {
        svarJson(svar, 200, job.info());
      } else if (req.method === 'POST' && sti === '/api/opsaetning/opret') {
        const krop = (await laesKrop(req)) as { lat?: unknown; lon?: unknown; navn?: unknown };
        job.start({
          lat: Number(krop.lat),
          lon: Number(krop.lon),
          navn: typeof krop.navn === 'string' ? krop.navn : '',
        });
        svarJson(svar, 200, job.info());
      } else if (req.method === 'POST' && sti === '/api/opsaetning/fortsaet') {
        job.fortsaetUdenKort();
        svarJson(svar, 200, job.info());
      } else if (req.method === 'GET' && sti.startsWith('/start/')) {
        await sendFil(rod, sti.slice('/start/'.length), svar);
      } else {
        svar.writeHead(404).end();
      }
    })();
  });

  await new Promise<void>((klar, fejl) => {
    server.once('error', fejl);
    server.listen(port, '0.0.0.0', () => klar());
  });

  return {
    luk: () =>
      new Promise<void>((klar) => {
        server.close(() => klar());
        // Aabne forbindelser (siden polle) maa ikke holde porten optaget.
        server.closeAllConnections();
      }),
  };
};

// ---------------------------------------------------------------- ruter paa den rigtige server

export interface Koerselsvalg {
  readonly rod: string;
  readonly valg: Radarvalg;
  readonly port: number;
  /** Lukker serveren pænt. */
  readonly luk: () => Promise<void>;
  /** Starter programmet forfra (kun i den samlede udgave). */
  readonly genstart: (() => void) | null;
}

/** Opsaetningssiden og dens ruter paa den rigtige server, kun for maskinen selv. */
export const opsaetningsRuter =
  (k: Koerselsvalg) =>
  async (app: FastifyInstance): Promise<void> => {
    await app.register(fastifyStatic, {
      root: resolve(k.rod, 'setup'),
      prefix: '/start/',
      decorateReply: false,
      cacheControl: false,
    });

    await app.register(async (api) => {
      api.addHook('onRequest', async (req: FastifyRequest, reply) => {
        if (!erLokal(req.ip)) await reply.code(403).send({ fejl: 'Kun fra maskinen selv.' });
      });

      api.get('/api/opsaetning/info', async (): Promise<Info> => ({
        tilstand: 'klar',
        valg: offentligtValg(k.valg),
        fremdrift: 100,
        besked: '',
        fejl: null,
        kanFortsaette: false,
        harKort: await harKortTil(k.rod, k.valg),
        admin: await adminInfo(k.rod, k.port, k.valg.token),
        port: k.port,
      }));

      api.post('/api/opsaetning/aabn-skaerm', () => ({ aabnet: aabnSkaerm(k.port) }));

      // Nyt centrum: glem valget og start forfra. Kun i den samlede udgave kan
      // programmet starte sig selv igen.
      api.post('/api/opsaetning/nyt', async (_req, reply) => {
        if (!k.genstart) return reply.code(400).send({ fejl: 'Genstart radaren selv.' });
        await rm(join(k.rod, 'radar.json'), { force: true });
        setTimeout(k.genstart, 150);
        return { ok: true };
      });

      api.post('/api/opsaetning/stop', () => {
        setTimeout(() => void k.luk(), 150);
        return { ok: true };
      });
    });
  };

export { STANDARD_PORT };
