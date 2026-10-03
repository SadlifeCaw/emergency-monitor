/**
 * Opstart.
 *
 * En proces. Den serverer skaermen, holder motoren i gang og sender
 * skaermbilledet ud. Ingen database, ingen container, intet internet.
 *
 * Selve opbygningen ligger i server.ts, saa testene kan bygge den samme server
 * uden at aabne en port.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { laesKonfig } from './konfig.js';
import { lavServer } from './server.js';

const ROD = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Laeser .env ind i miljoeet, hvis den findes.
 *
 * Node kan det selv fra version 20, saa der er ingen afhaengighed at holde
 * opdateret. Filen er valgfri: i udvikling klarer serveren sig uden og
 * genererer selv et flygtigt token.
 *
 * Aegte miljoevariabler vinder over filen - saa `NATVAGT_HASTIGHED=60 npm start`
 * stadig virker, ogsaa naar .env siger noget andet.
 */
const laesEnvfil = (): void => {
  try {
    process.loadEnvFile(resolve(ROD, '.env'));
  } catch {
    // Ingen .env. Helt i orden.
  }
};

const start = async (): Promise<void> => {
  laesEnvfil();
  const konfig = laesKonfig(ROD);
  const { app, natvagt } = await lavServer({ konfig, rod: ROD });

  natvagt.start();

  const luk = async (): Promise<void> => {
    natvagt.stands();
    await app.close();
  };
  process.on('SIGINT', () => void luk());
  process.on('SIGTERM', () => void luk());

  await app.listen({ host: konfig.vaert, port: konfig.port });
  app.log.info(
    `Natvagt klar. Scenarie "${natvagt.scenarie().navn}", hastighed ${konfig.hastighed}x, fase ${natvagt.tilstand().fase}.`,
  );
  app.log.info(`Admin: http://<denne-maskines-ip>:${konfig.port}/admin/`);
};

/** Opstartsfejl skal kunne loeses af et menneske kl. 19 med en projektor i haanden. */
const forklar = (fejl: unknown): string => {
  const besked = (fejl as Error).message;
  if (besked.includes('EADDRINUSE')) {
    return `${besked}\n  Porten er optaget af et andet program. Vaelg en anden:\n    NATVAGT_PORT=8478 npm start`;
  }
  return besked;
};

start().catch((fejl: unknown) => {
  console.error(`\nNatvagten kunne ikke starte:\n  ${forklar(fejl)}\n`);
  process.exitCode = 1;
});
