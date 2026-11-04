#!/usr/bin/env node
/**
 * Laver udgivelsen: en zip-fil med Radar.exe, som koerer paa en ren Windows-PC
 * uden Node, npm eller Git.
 *
 *   npm run udgivelse            # version fra package.json
 *   npm run udgivelse -- 1.0.0   # eller en bestemt
 *
 * Trin:
 *  1. bygger skaerm og admin (Vite)
 *  2. samler serveren i én fil (esbuild)
 *  3. laver en Node "single executable" (SEA): node.exe + serveren indlejret
 *  4. samler mappen med skaerm, admin, scenarier og vaerktoej
 *  5. pakker den som zip
 *
 * Resultatet ligger i udgivelse/ og er ikke med i git.
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const ROD = resolve(import.meta.dirname, '..');
const UD = join(ROD, 'udgivelse');
const BYG = join(UD, 'bygge');
const MAPPE = join(UD, 'Radar');

const pakke = JSON.parse(await readFile(join(ROD, 'package.json'), 'utf8'));
const version = process.argv[2] ?? pakke.version;
const log = (t) => process.stdout.write(`${t}\n`);
const koer = (kommando, argumenter, mappe = ROD) =>
  execFileSync(kommando, argumenter, { cwd: mappe, stdio: 'inherit', shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(kommando) });

log(`\n  RADAR ${version}\n`);

// ---------------------------------------------------------------- 1. frontend
log('1/5  Bygger skaerm og admin ...');
koer('npm.cmd', ['run', 'build', '--workspace', 'display', '--workspace', 'admin']);

// ---------------------------------------------------------------- 2. server
log('2/5  Samler serveren i én fil ...');
await rm(UD, { recursive: true, force: true });
await mkdir(BYG, { recursive: true });

await build({
  entryPoints: [join(ROD, 'server/src/radar.ts')],
  outfile: join(BYG, 'radar.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  // ws bruger dem, hvis de findes; ellers regner den selv det ud.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});

// ---------------------------------------------------------------- 3. exe
log('3/5  Laver Radar.exe (Node single executable) ...');
await writeFile(
  join(BYG, 'sea-config.json'),
  JSON.stringify({
    main: join(BYG, 'radar.cjs'),
    output: join(BYG, 'radar.blob'),
    disableExperimentalSEAWarning: true,
  }),
);
koer(process.execPath, ['--experimental-sea-config', join(BYG, 'sea-config.json')]);

const exe = join(MAPPE, 'Radar.exe');
await mkdir(MAPPE, { recursive: true });
await cp(process.execPath, exe);
koer(process.execPath, [
  join(ROD, 'node_modules/postject/dist/cli.js'),
  exe,
  'NODE_SEA_BLOB',
  join(BYG, 'radar.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
]);

// Ingen konsol: programmet skal aabne et vindue (siden i browseren), ikke en sort kommandoprompt.
// Det goeres ved at saette PE-headerens "subsystem" til Windows GUI (2).
{
  const bytes = await readFile(exe);
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.toString('ascii', pe, pe + 2) !== 'PE') throw new Error('Radar.exe er ikke en PE-fil.');
  bytes.writeUInt16LE(2, pe + 24 + 68);
  await writeFile(exe, bytes);
}

// ---------------------------------------------------------------- 4. mappen
log('4/5  Samler mappen ...');
await cp(join(ROD, 'display/dist'), join(MAPPE, 'display/dist'), { recursive: true });
await cp(join(ROD, 'admin/dist'), join(MAPPE, 'admin/dist'), { recursive: true });

// Opsaetningssiden (foerste start, QR-kode og knapper). Ren HTML, ingen build.
await cp(join(ROD, 'setup'), join(MAPPE, 'setup'), { recursive: true });

// Scenariet uden den alarm, der hoerer til udviklerens sted. Centrum saettes ved foerste start.
const scenarie = JSON.parse(await readFile(join(ROD, 'scenarios/nat.json'), 'utf8'));
scenarie.haendelser = [];
// Neutralt udgangspunkt. Centrum og navn saettes af Radar.exe ved foerste start.
scenarie.base = { lat: 56, lon: 10, label: 'CENTRUM', verificeret: false };
scenarie.nat = { ...scenarie.nat, fra: '17:00', til: '05:00' };
scenarie._note =
  'Indstillinger. Centrum saettes af Radar.exe ved foerste start. Alarmer oprettes fra telefonen.';
await mkdir(join(MAPPE, 'scenarios'), { recursive: true });
await writeFile(join(MAPPE, 'scenarios/nat.json'), `${JSON.stringify(scenarie, null, 2)}\n`);
await writeFile(
  join(MAPPE, 'scenarios/signaltaarne.json'),
  `${JSON.stringify({ version: 1, aktiv: false, telefon: '', taarnLyd: null, taarne: [] }, null, 2)}\n`,
);

// Kortvaerktoej (go-pmtiles): henter kortudsnittet ved foerste start.
if (existsSync(join(ROD, 'tools/pmtiles.exe'))) {
  await mkdir(join(MAPPE, 'tools'), { recursive: true });
  await cp(join(ROD, 'tools/pmtiles.exe'), join(MAPPE, 'tools/pmtiles.exe'));
  if (existsSync(join(ROD, 'tools/LICENSE'))) {
    await cp(join(ROD, 'tools/LICENSE'), join(MAPPE, 'tools/LICENSE-go-pmtiles.txt'));
  }
}

await mkdir(join(MAPPE, 'assets/maps'), { recursive: true });
await writeFile(join(MAPPE, 'assets/maps/.gitkeep'), '');
for (const [mappe, tekst] of [
  [
    'assets/lyd',
    'Lægges lydklip (mp3, wav, m4a ...) her, kan de vælges i admin under Lydklip.\nValgfrit: radaren har sin egen sirene.\n',
  ],
  [
    'assets/koder',
    'Valgfrit. Billeder (PNG) til de koder, der kan vises på skærmen i 10 sekunder.\nBruges kun af udvidelsen med signaltårne.\n',
  ],
]) {
  await mkdir(join(MAPPE, mappe), { recursive: true });
  await writeFile(join(MAPPE, mappe, 'LAES-MIG.txt'), tekst, 'utf8');
}

await writeFile(
  join(MAPPE, 'LAES-MIG.txt'),
  `RADAR ${version}
=================

1. Pak hele mappen ud (højreklik på zip-filen -> Udpak alle).
2. Dobbeltklik på Radar.exe.
   Windows kan sige "Windows har beskyttet din pc". Klik "Flere oplysninger"
   og derefter "Kør alligevel". Programmet er ikke signeret.
3. Der åbner en side i din browser. Klik på kortet, hvor radaren skal have sit
   centrum (eller indsæt et koordinat fra Google Maps), og tryk "Opret radar".
   Kortet hentes (kræver internet, kun den ene gang).
4. Scan QR-koden på siden med instruktørens telefon (samme wifi) for at komme
   ind i admin. Tryk "Åbn radarskærmen i fuldskærm" for selve skærmen.
5. Tryk "Tillad", hvis Windows spørger om netværksadgang.
6. Tryk på skærmen én gang for at slå lyden til.

Nyt centrum: åbn Radar.exe igen og tryk "Nyt centrum" på siden.
Stop: tryk "Stop radaren" på siden.
Går noget galt, står det i filen radar-fejl.log ved siden af programmet.

Kildekode og hjælp: https://github.com/SadlifeCaw/emergency-monitor
`,
  'utf8',
);
await writeFile(join(MAPPE, 'version.txt'), `${version}\n`);

// ---------------------------------------------------------------- 5. zip
log('5/5  Pakker zip ...');
const zip = join(UD, `Radar-${version}-windows.zip`);
// Windows' egen tar laver en rigtig zip (Compress-Archive bruger backslash i stierne).
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
koer(tar, ['-a', '-c', '-f', zip, 'Radar'], UD);

log(`\n  FAERDIG\n  ${zip}\n`);
