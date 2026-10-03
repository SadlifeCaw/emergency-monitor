#!/usr/bin/env node
/**
 * Henter offline-kortet.
 *
 * Traekker et lille udsnit omkring lejren ud af Protomaps' daglige planet-build.
 * Udtraekket sker med HTTP range-requests, saa vi henter nogle faa MB ud af en
 * 138 GB fil i stedet for at downloade hele kloden.
 *
 * Resultatet er ÉN fil, assets/maps/vork.pmtiles, som skaermen laeser lokalt.
 * Naar den ligger der, virker kortet uden internet. Det er hele pointen.
 *
 * Brug:
 *   node scripts/hent-kort.mjs              # bbox regnes ud fra scenarios/nat.json
 *   node scripts/hent-kort.mjs --margin 5000
 */

import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { arch, platform } from 'node:os';

const ROD = resolve(import.meta.dirname, '..');
const VAERKTOEJ = join(ROD, 'tools');
const MAAL = join(ROD, 'assets/maps/vork.pmtiles');

/** Protomaps' basemap-build gaar til zoom 15; derover overzoomer vi i browseren. */
const MAKS_ZOOM = 15;
/** Hvor meget kort ud over alarmradius. Skaermen skal vise omgivelser, ikke kun en cirkel. */
const STANDARD_MARGIN_M = 3000;

const log = (besked) => process.stdout.write(`${besked}\n`);

const argv = process.argv.slice(2);
const flag = (navn, standard) => {
  const i = argv.indexOf(`--${navn}`);
  return i === -1 ? standard : argv[i + 1];
};

// ---------------------------------------------------------------- bbox

/**
 * Kortudsnittet udledes af scenariefilen, ikke af en haardkodet konstant.
 * Flytter basen sig i fase 0, flytter kortet med.
 */
const beregnBbox = async (marginM) => {
  const scenarie = JSON.parse(await readFile(join(ROD, 'scenarios/nat.json'), 'utf8'));
  const { lat, lon } = scenarie.base;

  const dLat = marginM / 111_320;
  const dLon = marginM / (111_320 * Math.cos((lat * Math.PI) / 180));

  return {
    lat,
    lon,
    maxRadiusM: scenarie.kort.maxRadiusM,
    bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(','),
  };
};

// ---------------------------------------------------------------- binaer

const vaelgAktiv = (assets) => {
  const erWindows = platform() === 'win32';
  const os = erWindows ? 'Windows' : platform() === 'darwin' ? 'Darwin' : 'Linux';
  const cpu = arch() === 'arm64' ? 'arm64' : 'x86_64';
  const fundet = assets.find((a) => a.name.includes(os) && a.name.includes(cpu));

  if (!fundet) {
    throw new Error(`Ingen go-pmtiles-udgave til ${os}/${cpu}. Hent den manuelt fra
  https://github.com/protomaps/go-pmtiles/releases`);
  }
  return fundet;
};

const pakUd = async (arkiv, maalmappe) => {
  const erZip = arkiv.endsWith('.zip');
  // Windows' egen tar.exe kan zip, men Git Bash' GNU tar kan ikke. Derfor
  // PowerShell paa Windows og tar alle andre steder.
  const [kommando, argumenter] = erZip && platform() === 'win32'
    ? ['powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${arkiv}' -DestinationPath '${maalmappe}'`]]
    : ['tar', erZip ? ['-xf', arkiv, '-C', maalmappe] : ['-xzf', arkiv, '-C', maalmappe]];

  await koer(kommando, argumenter);
};

const sikrBinaer = async () => {
  const navn = platform() === 'win32' ? 'pmtiles.exe' : 'pmtiles';
  const sti = join(VAERKTOEJ, navn);
  if (existsSync(sti)) {
    log(`  binaer allerede hentet: tools/${navn}`);
    return sti;
  }

  log('  henter go-pmtiles ...');
  await mkdir(VAERKTOEJ, { recursive: true });

  const udgivelse = await (
    await fetch('https://api.github.com/repos/protomaps/go-pmtiles/releases/latest')
  ).json();
  const aktiv = vaelgAktiv(udgivelse.assets);

  const arkiv = join(VAERKTOEJ, aktiv.name);
  const svar = await fetch(aktiv.browser_download_url);
  if (!svar.ok) throw new Error(`Kunne ikke hente ${aktiv.name}: HTTP ${svar.status}`);
  await writeFile(arkiv, Buffer.from(await svar.arrayBuffer()));

  await pakUd(arkiv, VAERKTOEJ);
  await rm(arkiv, { force: true });
  if (platform() !== 'win32') await chmod(sti, 0o755);

  log(`  binaer klar: tools/${navn} (${udgivelse.tag_name})`);
  return sti;
};

// ---------------------------------------------------------------- build

/** Finder den seneste daglige planet-build ved at gaa bagud fra i dag. */
const findSenesteBuild = async () => {
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(Date.now() - i * 86_400_000);
    const dato = d.toISOString().slice(0, 10).replaceAll('-', '');
    const url = `https://build.protomaps.com/${dato}.pmtiles`;
    const svar = await fetch(url, { method: 'HEAD' });
    if (svar.ok) return { url, dato };
  }
  throw new Error('Fandt ingen planet-build inden for de sidste 14 dage.');
};

// ---------------------------------------------------------------- koersel

const koer = (kommando, argumenter) =>
  new Promise((klar, fejl) => {
    const p = spawn(kommando, argumenter, { stdio: 'inherit' });
    p.on('error', fejl);
    p.on('close', (kode) =>
      kode === 0 ? klar() : fejl(new Error(`${kommando} afsluttede med kode ${kode}`)),
    );
  });

// ---------------------------------------------------------------- hovedforloeb

const marginM = Number(flag('margin', STANDARD_MARGIN_M));
if (!Number.isFinite(marginM) || marginM < 500) {
  throw new Error(`--margin skal vaere mindst 500 meter, fik ${flag('margin', '')}`);
}

const { lat, lon, maxRadiusM, bbox } = await beregnBbox(marginM);

log(`
  HENTER OFFLINE-KORT

  Base        ${lat}, ${lon}
  Alarmradius ${maxRadiusM} m
  Kortmargin  ${marginM} m
  Bbox        ${bbox}
  Maks zoom   ${MAKS_ZOOM}
`);

const binaer = await sikrBinaer();
const { url, dato } = await findSenesteBuild();
log(`  planet-build: ${dato}`);

await mkdir(join(ROD, 'assets/maps'), { recursive: true });
log('  traekker udsnit ud (range-requests, kan tage et par minutter) ...\n');

await koer(binaer, ['extract', url, MAAL, `--bbox=${bbox}`, `--maxzoom=${MAKS_ZOOM}`]);

const { size } = await stat(MAAL);
log(`
  FAERDIG

  assets/maps/vork.pmtiles   ${(size / 1e6).toFixed(1)} MB

  Test at kortet virker uden internet: slaa wifi fra og genindlaes skaermen.
`);
