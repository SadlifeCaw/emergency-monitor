/**
 * Serveren, samlet men ikke startet.
 *
 * Skilt fra index.ts, saa API-testene kan bygge den praecis som i drift og
 * sende forespoergsler igennem uden at aabne en port. En admin-rute, der kun er
 * afproevet mod en anden opsaetning end den rigtige, er ikke afproevet.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registrerAdminRuter } from './api/admin.js';
import { registrerOffentligeRuter } from './api/offentlig.js';
import { startNatvagt } from './drift/natvagt.js';
import type { Natvagt } from './drift/natvagt.js';
import type { Konfig } from './konfig.js';
import type { Ur } from './motor/ur.js';
import { lavUdsending } from './ws/udsending.js';

export interface Serveropsaetning {
  readonly konfig: Konfig;
  readonly rod: string;
  /** Overstyrer uret. Bruges af testene. */
  readonly ur?: Ur;
  /** Slaas fra i test, hvor forespoergsler sendes direkte ind i appen. */
  readonly medStatiskeFiler?: boolean;
}

export interface Server {
  readonly app: FastifyInstance;
  readonly natvagt: Natvagt;
}

/**
 * Statiske filer: offline-kortet og den byggede skaerm.
 *
 * @fastify/static svarer paa Range-requests, hvilket er hele forudsaetningen for
 * PMTiles: browseren henter kun de bytes, den skal bruge, ud af den lokale fil.
 */
const registrerStatiskeFiler = async (
  app: FastifyInstance,
  rod: string,
  lydmappe: string,
): Promise<void> => {
  const kortmappe = resolve(rod, 'assets/maps');
  const harKort = existsSync(kortmappe);
  let harDekoreret = false;

  if (harKort) {
    harDekoreret = true;
    await app.register(fastifyStatic, {
      root: kortmappe,
      prefix: '/kort/',
      // Kortet aendrer sig ikke i loebet af natten.
      cacheControl: true,
      maxAge: '1d',
    });
  } else {
    app.log.warn('assets/maps mangler - koer "npm run hent-kort". Skaermen tegner et noedgitter.');
  }

  // Lydklippene. Mappen oprettes, saa man bare kan lægge en fil i den.
  mkdirSync(lydmappe, { recursive: true });
  await app.register(fastifyStatic, {
    root: lydmappe,
    prefix: '/lyd/',
    decorateReply: !harDekoreret,
    // En udskiftet fil med samme navn skal kunne hoeres med det samme.
    cacheControl: false,
    index: false,
  });
  harDekoreret = true;

  // Skaermen og admin-fladen. I udvikling koerer Vite selv, saa dist findes ikke.
  const flader: readonly { readonly mappe: string; readonly praefiks?: string }[] = [
    { mappe: 'admin/dist', praefiks: '/admin/' },
    { mappe: 'display/dist' },
  ];

  for (const { mappe, praefiks } of flader) {
    const sti = resolve(rod, mappe);
    if (!existsSync(sti)) continue;
    await app.register(fastifyStatic, {
      root: sti,
      ...(praefiks ? { prefix: praefiks } : {}),
      decorateReply: !harDekoreret,
    });
    harDekoreret = true;

    /*
     * /admin uden skraastreg skal foere til /admin/ og ikke til en 404.
     *
     * @fastify/static's egen `redirect` gaelder kun mapper inde i roden, ikke
     * selve praefikset - saa den skal skrives her. Ingen taster den afsluttende
     * skraastreg, og slet ikke paa en telefon i moerke.
     */
    if (praefiks) {
      const uden = praefiks.replace(/\/$/, '');
      app.get(uden, (_req, reply) => reply.redirect(praefiks, 301));
    }
  }
};

export const lavServer = async ({
  konfig,
  rod,
  ur,
  medStatiskeFiler = true,
}: Serveropsaetning): Promise<Server> => {
  const app = Fastify({ logger: { level: konfig.miljoe === 'drift' ? 'warn' : 'info' } });

  if (konfig.tokenErGenereret) {
    app.log.info(`Flygtigt admin-token til denne session: ${konfig.adminToken}`);
  }

  await app.register(fastifyWebsocket);

  const lydmappe = konfig.lydmappe ?? resolve(rod, 'assets/lyd');
  const udsending = lavUdsending();
  const natvagt = await startNatvagt({
    konfig,
    udsend: (skaermbillede) => udsending.udsend(skaermbillede),
    paaFejl: (fejl) => app.log.error({ fejl }, 'Fejl i tick-loopet'),
    ...(ur ? { ur } : {}),
  });

  const kodemappe = konfig.kodemappe ?? resolve(rod, 'assets/koder');
  mkdirSync(kodemappe, { recursive: true });

  registrerOffentligeRuter(app, { natvagt, udsending, kodemappe });
  await registrerAdminRuter(app, { natvagt, konfig, udsending, lydmappe, kodemappe });

  if (medStatiskeFiler) await registrerStatiskeFiler(app, rod, lydmappe);

  return { app, natvagt };
};
