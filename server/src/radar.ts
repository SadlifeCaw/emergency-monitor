/**
 * Radar.exe: indgangen i den samlede udgave.
 *
 * Dobbeltklik, angiv et centrum, og radaren koerer. Ingen installation, ingen
 * kommandolinje, ingen filer at redigere:
 *
 *  1. foerste gang spoerges der om centrum (indsat fra Google Maps)
 *  2. kortet hentes (kraever internet - den ene gang)
 *  3. serveren starter, admin-linket vises som QR-kode
 *  4. skaermen aabnes i fuldskaerm, og PC'en holdes vaagen
 *
 * Selve serveren er den samme som i udviklingsudgaven (server.ts).
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { isSea } from 'node:sea';
import { laesKonfig } from './konfig.js';
import { hentKort, harKortTil } from './pakke/kort.js';
import {
  gemValg,
  laesValg,
  nytValg,
  ryddGammelNat,
  saetCentrum,
  tolkKoordinat,
  type Radarvalg,
} from './pakke/opsaetning.js';
import { aabnSkaerm, holdVaagen, visAdminLink } from './pakke/visning.js';
import { lavServer } from './server.js';

/** Programmet ligger i en mappe sammen med skaerm, admin, scenarier og kort. */
const ROD = isSea() ? dirname(process.execPath) : process.cwd();

const ud = (tekst: string): void => {
  process.stdout.write(`${tekst}\n`);
};

const BANNER = `
  ╔══════════════════════════════════════╗
  ║              R A D A R               ║
  ║        overvågning · natvagt         ║
  ╚══════════════════════════════════════╝
`;

/**
 * Linjer fra konsollen, i den raekkefoelge de kommer.
 *
 * Lines gemmes, ogsaa naar ingen spoerger lige nu: bliver input sendt ind paa
 * én gang (en test, eller en indsat tekst), ville de ellers gaa tabt.
 */
interface Indtastning {
  readonly rl: Interface;
  naeste(tekst: string): Promise<string | null>;
}

const lavIndtastning = (): Indtastning => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const koe: string[] = [];
  let ventende: ((linje: string | null) => void) | null = null;
  let lukket = false;

  rl.on('line', (linje) => {
    if (ventende) {
      const klar = ventende;
      ventende = null;
      klar(linje);
    } else {
      koe.push(linje);
    }
  });
  rl.on('close', () => {
    lukket = true;
    ventende?.(null);
    ventende = null;
  });

  return {
    rl,
    naeste: (tekst) => {
      process.stdout.write(tekst);
      const foerste = koe.shift();
      if (foerste !== undefined) return Promise.resolve(foerste);
      if (lukket) return Promise.resolve(null);
      return new Promise((klar) => {
        ventende = klar;
      });
    },
  };
};

/** Spoerger til centrum, til svaret kan laeses som et koordinat. */
const spoergOmCentrum = async (ind: Indtastning): Promise<Radarvalg | null> => {
  ud(`
  Hvor skal radaren have sit centrum?

  Højreklik på stedet i Google Maps og klik på tallene øverst i menuen, så de
  kopieres. Indsæt dem her (fx  55.674928, 9.347811).
`);

  for (let forsoeg = 0; forsoeg < 5; forsoeg += 1) {
    const svar = await ind.naeste('  Centrum (bredde, længde): ');
    if (svar === null) return null;

    const koordinat = tolkKoordinat(svar);
    if (!koordinat) {
      ud('  Det kunne jeg ikke læse som to tal. Prøv igen.\n');
      continue;
    }
    const navn = await ind.naeste('  Navn på stedet (ENTER for "CENTRUM"): ');
    return nytValg(koordinat, navn ?? '');
  }
  return null;
};

/** Staar scenariets base paa det sted, der er valgt? */
const scenarieHarCentrum = async (valg: Radarvalg): Promise<boolean> => {
  try {
    const s = JSON.parse(await readFile(join(ROD, 'scenarios', 'nat.json'), 'utf8')) as {
      base?: { lat?: number; lon?: number };
    };
    return s.base?.lat === valg.lat && s.base?.lon === valg.lon;
  } catch {
    return false;
  }
};

const start = async (): Promise<void> => {
  ud(BANNER);

  const ind = lavIndtastning();
  let valg = await laesValg(ROD);

  if (valg && !process.argv.includes('--nyt')) {
    ud(`  Centrum: ${valg.navn}  (${valg.lat}, ${valg.lon})\n`);
    const svar = await ind.naeste('  Tryk ENTER for at starte, eller skriv N for et nyt centrum: ');
    if (/^n/i.test((svar ?? '').trim())) valg = null;
  }

  if (!valg) {
    const gammel = await laesValg(ROD);
    const nyt = await spoergOmCentrum(ind);
    if (!nyt) throw new Error('Der blev ikke angivet et centrum.');
    // Samme adgangskode som før, så en QR-kode på telefonen stadig virker.
    valg = gammel ? { ...nyt, token: gammel.token, port: gammel.port } : nyt;
    await gemValg(ROD, valg);
  }
  ind.rl.close();

  if (!(await scenarieHarCentrum(valg))) {
    await saetCentrum(ROD, valg);
    await ryddGammelNat(ROD);
  }

  if (!(await harKortTil(ROD, valg))) {
    ud('\n  Henter kortet til dit centrum. Det kræver internet og tager et par minutter ...\n');
    await hentKort(ROD, valg);
  }

  process.env['NATVAGT_MILJOE'] = 'drift';
  process.env['NATVAGT_ADMIN_TOKEN'] = valg.token;
  process.env['NATVAGT_PORT'] = String(valg.port);

  const konfig = laesKonfig(ROD);
  const { app, natvagt } = await lavServer({ konfig, rod: ROD });
  natvagt.start();

  const luk = async (): Promise<void> => {
    natvagt.stands();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void luk());
  process.on('SIGTERM', () => void luk());

  await app.listen({ host: konfig.vaert, port: konfig.port });

  await visAdminLink(ROD, konfig.port, valg.token);

  if (!process.argv.includes('--uden-browser')) {
    if (!aabnSkaerm(konfig.port)) {
      ud(`\n  Fandt ikke Chrome eller Edge. Åbn  http://localhost:${konfig.port}/  selv.`);
    }
  }
  if (!process.argv.includes('--uden-browser')) holdVaagen();

  ud(`
  RADAREN KØRER

  Skærmen:  http://localhost:${konfig.port}/
  Hvis Windows spørger om netværksadgang, så tryk "Tillad".
  Tryk på skærmen én gang for at slå lyden til.

  Luk dette vindue for at stoppe radaren.
`);
};

/** Fejl skal kunne loeses af et menneske med en projektor i haanden. */
const forklar = (fejl: unknown): string => {
  const besked = (fejl as Error).message;
  if (besked.includes('EADDRINUSE')) {
    return `${besked}\n  Radaren koerer maaske allerede. Luk det andet vindue og proev igen.`;
  }
  return besked;
};

process.on('uncaughtException', (fejl) => {
  process.stderr.write(`\n  Uventet fejl: ${(fejl as Error).message}\n`);
});

start().catch((fejl: unknown) => {
  process.stderr.write(`\n  Radaren kunne ikke starte:\n  ${forklar(fejl)}\n\n`);
  // Vinduet maa ikke lukke, foer man har kunnet laese det.
  setInterval(() => undefined, 60_000);
});
