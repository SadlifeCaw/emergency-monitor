/**
 * Offline-kortet i den samlede udgave.
 *
 * Henter et lille udsnit omkring centrum ud af Protomaps' daglige planet-build
 * med go-pmtiles (HTTP range-requests: nogle faa MB ud af en kæmpefil). Kraever
 * internet - men kun den ene gang. Bagefter ligger kortet som en fil ved siden
 * af programmet, og alt virker uden net.
 *
 * Svigter det, kører radaren videre med et noedgitter. Det er ikke en fejl, der
 * maa stoppe en aften.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAKS_ZOOM = 15;
/** Kort ud over alarmradius, saa skaermen viser omgivelser og ikke kun en cirkel. */
const MARGIN_M = 4500;
const METER_PR_GRAD = 111_320;

interface Kortmaerke {
  readonly lat: number;
  readonly lon: number;
}

const kortFil = (rod: string): string => join(rod, 'assets', 'maps', 'vork.pmtiles');
const maerkeFil = (rod: string): string => join(rod, 'assets', 'maps', 'kort.json');

/** Findes der et kort, og er det lavet til dette centrum? */
export const harKortTil = async (rod: string, valg: Kortmaerke): Promise<boolean> => {
  if (!existsSync(kortFil(rod))) return false;
  try {
    const m = JSON.parse(await readFile(maerkeFil(rod), 'utf8')) as Partial<Kortmaerke>;
    return m.lat === valg.lat && m.lon === valg.lon;
  } catch {
    return false;
  }
};

export const bbox = (valg: Kortmaerke, margin: number = MARGIN_M): string => {
  const dLat = margin / METER_PR_GRAD;
  const dLon = margin / (METER_PR_GRAD * Math.cos((valg.lat * Math.PI) / 180));
  return [valg.lon - dLon, valg.lat - dLat, valg.lon + dLon, valg.lat + dLat]
    .map((v) => v.toFixed(6))
    .join(',');
};

const koer = (kommando: string, argumenter: readonly string[]): Promise<void> =>
  new Promise((klar, fejl) => {
    const p = spawn(kommando, [...argumenter], { stdio: 'inherit' });
    p.on('error', fejl);
    p.on('close', (kode) =>
      kode === 0 ? klar() : fejl(new Error(`${kommando} stoppede med kode ${kode}`)),
    );
  });

/** go-pmtiles ligger med i udgaven. Mangler den, hentes den fra GitHub. */
const sikrVaerktoej = async (rod: string): Promise<string> => {
  const sti = join(rod, 'tools', 'pmtiles.exe');
  if (existsSync(sti)) return sti;

  await mkdir(join(rod, 'tools'), { recursive: true });
  const udgivelse = (await (
    await fetch('https://api.github.com/repos/protomaps/go-pmtiles/releases/latest')
  ).json()) as { assets: { name: string; browser_download_url: string }[] };
  const aktiv = udgivelse.assets.find((a) => a.name.includes('Windows') && a.name.includes('x86_64'));
  if (!aktiv) throw new Error('Fandt ingen go-pmtiles til Windows.');

  const arkiv = join(rod, 'tools', aktiv.name);
  const svar = await fetch(aktiv.browser_download_url);
  if (!svar.ok) throw new Error(`Kunne ikke hente go-pmtiles: HTTP ${svar.status}`);
  await writeFile(arkiv, Buffer.from(await svar.arrayBuffer()));
  await koer('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Force -Path '${arkiv}' -DestinationPath '${join(rod, 'tools')}'`,
  ]);
  await rm(arkiv, { force: true });
  return sti;
};

const findSenesteBuild = async (): Promise<string> => {
  for (let i = 0; i < 14; i += 1) {
    const dato = new Date(Date.now() - i * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '');
    const url = `https://build.protomaps.com/${dato}.pmtiles`;
    const svar = await fetch(url, { method: 'HEAD' });
    if (svar.ok) return url;
  }
  throw new Error('Fandt ingen kortdata inden for de sidste 14 dage.');
};

/** Henter kortet. Returnerer true, hvis det lykkedes. */
export const hentKort = async (rod: string, valg: Kortmaerke): Promise<boolean> => {
  try {
    const vaerktoej = await sikrVaerktoej(rod);
    const url = await findSenesteBuild();
    await mkdir(join(rod, 'assets', 'maps'), { recursive: true });

    await koer(vaerktoej, [
      'extract',
      url,
      kortFil(rod),
      `--bbox=${bbox(valg)}`,
      `--maxzoom=${MAKS_ZOOM}`,
    ]);

    const { size } = await stat(kortFil(rod));
    await writeFile(maerkeFil(rod), JSON.stringify({ lat: valg.lat, lon: valg.lon }), 'utf8');
    process.stdout.write(`\n  Kortet er hentet (${(size / 1e6).toFixed(1)} MB) og virker nu uden internet.\n`);
    return true;
  } catch (fejl) {
    process.stdout.write(
      `\n  Kortet kunne ikke hentes (${(fejl as Error).message}).\n` +
        '  Radaren kører videre med et nødgitter. Start programmet igen med internet,\n' +
        '  hvis du vil have det rigtige kort.\n',
    );
    return false;
  }
};
