/**
 * Radar.exe: indgangen i den samlede udgave.
 *
 * Dobbeltklik. Der er intet konsolvindue: programmet aabner en side i
 * brugerens egen browser, hvor man vaelger centrum paa et kort, ser kortet
 * blive hentet og faar en QR-kode til admin. Se pakke/gui.ts.
 *
 *  1. koerer radaren allerede, aabnes siden bare igen
 *  2. foerste gang (eller "nyt centrum") koerer opsaetningsserveren, til kortet er hentet
 *  3. den rigtige server starter paa samme port, og siden skifter til "klar"
 *
 * Selve serveren er den samme som i udviklingsudgaven (server.ts).
 */

import { spawn } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isSea } from 'node:sea';
import { laesKonfig } from './konfig.js';
import {
  findPort,
  lavOpsaetningsjob,
  opsaetningsRuter,
  startOpsaetningsserver,
} from './pakke/gui.js';
import {
  gemValg,
  laesValg,
  ryddGammelNat,
  saetCentrum,
  STANDARD_PORT,
  type Radarvalg,
} from './pakke/opsaetning.js';
import { aabnIBrowser, holdVaagen } from './pakke/visning.js';
import { lavServer } from './server.js';

/** Programmet ligger i en mappe sammen med skaerm, admin, scenarier og kort. */
const ROD = isSea() ? dirname(process.execPath) : process.cwd();
const ARG = new Set(process.argv.slice(2));

/** Fejl gemmes i en fil: der er ingen konsol at skrive dem i. */
const logFejl = async (tekst: string): Promise<void> => {
  try {
    await appendFile(join(ROD, 'radar-fejl.log'), `${new Date().toISOString()}  ${tekst}\n`, 'utf8');
  } catch {
    // Kan filen ikke skrives, er der intet andet at goere.
  }
};

/** Et almindeligt Windows-vindue med fejlen, saa ingen sidder med et tomt skaerm. */
const visFejl = (tekst: string): void => {
  const sikker = tekst.replaceAll("'", '`').slice(0, 600);
  spawn(
    'powershell',
    [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${sikker}', 'Radar', 'OK', 'Error') | Out-Null`,
    ],
    { stdio: 'ignore', windowsHide: true, detached: true },
  ).unref();
};

/** Staar scenariets base paa det sted - og med det navn - der er valgt? */
const scenarieHarCentrum = async (valg: Radarvalg): Promise<boolean> => {
  try {
    const s = JSON.parse(await readFile(join(ROD, 'scenarios', 'nat.json'), 'utf8')) as {
      base?: { lat?: number; lon?: number; label?: string };
    };
    return s.base?.lat === valg.lat && s.base?.lon === valg.lon && s.base?.label === valg.navn;
  } catch {
    return false;
  }
};

const start = async (): Promise<void> => {
  let valg = await laesValg(ROD);
  const oenskedePort = valg?.port ?? STANDARD_PORT;

  // Koerer radaren allerede, vises bare dens side igen.
  const port = await findPort(oenskedePort);
  if (port === null) {
    aabnIBrowser(`http://localhost:${oenskedePort}/start/`);
    return;
  }
  if (valg && valg.port !== port) {
    valg = { ...valg, port };
    await gemValg(ROD, valg);
  }

  const startside = `http://localhost:${port}/start/`;
  let kommerFraOpsaetning = false;

  if (!valg || ARG.has('--nyt')) {
    const job = lavOpsaetningsjob(ROD, port);
    const opsaetning = await startOpsaetningsserver(ROD, port, job);
    if (!ARG.has('--uden-browser') && !ARG.has('--fra-siden')) aabnIBrowser(startside);
    valg = await job.faerdig;
    await opsaetning.luk();
    kommerFraOpsaetning = true;
  } else if (!(await scenarieHarCentrum(valg))) {
    await saetCentrum(ROD, valg);
    await ryddGammelNat(ROD);
  }

  process.env['NATVAGT_MILJOE'] = 'drift';
  process.env['NATVAGT_ADMIN_TOKEN'] = valg.token;
  process.env['NATVAGT_PORT'] = String(port);

  const konfig = laesKonfig(ROD);
  const valgt = valg;
  let natvagtStands = (): void => undefined;

  const luk = async (): Promise<void> => {
    natvagtStands();
    process.exit(0);
  };

  /** Starter programmet forfra som en ny proces (nyt centrum). Kun i den samlede udgave. */
  const genstart = isSea()
    ? (): void => {
        natvagtStands();
        // Siden er allerede aaben i browseren; den nye proces skal ikke aabne en fane til.
        spawn(process.execPath, ['--fra-siden'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }).unref();
        process.exit(0);
      }
    : null;

  const { app, natvagt } = await lavServer({
    konfig,
    rod: ROD,
    stille: true,
    ekstraRuter: opsaetningsRuter({ rod: ROD, valg: valgt, port, luk, genstart }),
  });
  natvagtStands = () => natvagt.stands();
  natvagt.start();

  process.on('SIGINT', () => void luk());
  process.on('SIGTERM', () => void luk());

  await app.listen({ host: konfig.vaert, port: konfig.port });

  if (!ARG.has('--uden-browser')) {
    // Kommer vi fra opsaetningssiden, er den allerede aaben og skifter selv til "klar".
    if (!kommerFraOpsaetning && !ARG.has('--fra-siden')) aabnIBrowser(startside);
    holdVaagen();
  }
};

process.on('uncaughtException', (fejl) => {
  void logFejl(`Uventet fejl: ${(fejl as Error).stack ?? (fejl as Error).message}`);
});

start().catch(async (fejl: unknown) => {
  const besked = (fejl as Error).message;
  await logFejl(`Kunne ikke starte: ${(fejl as Error).stack ?? besked}`);
  visFejl(`Radaren kunne ikke starte:\n\n${besked}\n\nDer er en logfil, radar-fejl.log, ved siden af programmet.`);
  setTimeout(() => process.exit(1), 4000);
});
