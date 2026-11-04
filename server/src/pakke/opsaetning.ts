/**
 * Opsaetningen i den samlede udgave (Radar.exe).
 *
 * Alt en kreds skal goere, er at angive et centrum. Her ligger det der
 * omsaetter det til filer: radar.json (valget og adgangskoden), scenariet med
 * det nye centrum, signaltaarnene omkring det, og rydning af den gamle nat.
 *
 * Rene funktioner, hvor det er muligt, saa de kan afproeves uden en konsol.
 */

import { randomBytes } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Radarvalg {
  readonly lat: number;
  readonly lon: number;
  readonly navn: string;
  readonly port: number;
  /** Adgangskoden til admin. Genereres én gang og staar i QR-koden. */
  readonly token: string;
}

export const STANDARD_PORT = 8477;
const STANDARD_NAVN = 'CENTRUM';

/**
 * Laeser et koordinat, som det staar, naar man kopierer det fra Google Maps.
 *
 * "55.674928, 9.347811" er det normale. Danske decimalkommaer ("55,6749 9,3478")
 * og blanke imellem klares ogsaa. Returnerer null, hvis det ikke er to tal i
 * rimelige graenser.
 */
export const tolkKoordinat = (tekst: string): { lat: number; lon: number } | null => {
  // Decimalkomma: kun hvis der slet ingen punktummer er, ellers er kommaet en adskiller.
  const normal = tekst.includes('.') ? tekst : tekst.replace(/(\d),(\d)/g, '$1.$2');
  const tal = normal.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (tal.length !== 2) return null;

  const [lat, lon] = tal as [number, number];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
};

export const nytValg = (
  koordinat: { lat: number; lon: number },
  navn: string,
  port: number = STANDARD_PORT,
): Radarvalg => ({
  lat: koordinat.lat,
  lon: koordinat.lon,
  navn: navn.trim().toUpperCase().slice(0, 30) || STANDARD_NAVN,
  port,
  token: randomBytes(18).toString('base64url'),
});

export const laesValg = async (rod: string): Promise<Radarvalg | null> => {
  try {
    const raa = JSON.parse(await readFile(join(rod, 'radar.json'), 'utf8')) as Partial<Radarvalg>;
    const { lat, lon, navn, port, token } = raa;
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      typeof navn !== 'string' ||
      typeof port !== 'number' ||
      typeof token !== 'string' ||
      token.length < 16
    ) {
      return null;
    }
    return { lat, lon, navn, port, token };
  } catch {
    return null;
  }
};

export const gemValg = (rod: string, valg: Radarvalg): Promise<void> =>
  writeFile(join(rod, 'radar.json'), `${JSON.stringify(valg, null, 2)}\n`, 'utf8');

// ---------------------------------------------------------------- centrum

const METER_PR_GRAD = 111_320;

const punktIRetning = (valg: Pick<Radarvalg, 'lat' | 'lon'>, afstandM: number, retning: number) => {
  const r = (retning * Math.PI) / 180;
  return {
    lat: +(valg.lat + (afstandM * Math.cos(r)) / METER_PR_GRAD).toFixed(6),
    lon: +(
      valg.lon +
      (afstandM * Math.sin(r)) / (METER_PR_GRAD * Math.cos((valg.lat * Math.PI) / 180))
    ).toFixed(6),
  };
};

/** Fire signaltaarne, ét i hver kvadrant. De traekkes forfra i admin, hvis man vil. */
export const standardTaarne = (valg: Pick<Radarvalg, 'lat' | 'lon'>) =>
  [0, 90, 180, 270].map((fra, i) => ({
    id: `taarn-${i + 1}`,
    titel: `TÅRN ${i + 1}`,
    vinkelFra: fra,
    vinkelTil: fra + 90,
    minM: 300,
    maksM: 800,
    ...punktIRetning(valg, 600, fra + 45),
    kode: null,
  }));

/** Skriver det nye centrum ind i scenariet og lader taarnene staa omkring det. */
export const saetCentrum = async (rod: string, valg: Radarvalg): Promise<void> => {
  const sti = join(rod, 'scenarios', 'nat.json');
  const scenarie = JSON.parse(await readFile(sti, 'utf8')) as Record<string, unknown>;

  scenarie['base'] = { lat: valg.lat, lon: valg.lon, label: valg.navn, verificeret: false };
  // En alarm fra et andet sted ligger uden for det nye kort og ville blive afvist.
  scenarie['haendelser'] = [];
  await writeFile(sti, `${JSON.stringify(scenarie, null, 2)}\n`, 'utf8');

  await writeFile(
    join(rod, 'scenarios', 'signaltaarne.json'),
    `${JSON.stringify(
      { version: 1, aktiv: false, telefon: '', taarnLyd: null, taarne: standardTaarne(valg) },
      null,
      2,
    )}\n`,
    'utf8',
  );
};

/** Sletter den gamle nats tilstand, saa den ikke peger paa det forrige sted. */
export const ryddGammelNat = async (rod: string): Promise<void> => {
  const filer = ['scenarie.json', 'runtime.json', 'udvidelse.json'];
  await Promise.all(
    filer.flatMap((f) => [
      rm(join(rod, 'state', f), { force: true }),
      rm(join(rod, 'state', `${f}.bak`), { force: true }),
      rm(join(rod, 'state', `${f}.tmp`), { force: true }),
    ]),
  );
};
