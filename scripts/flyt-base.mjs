/**
 * Flytter basen (kortets midtpunkt) i scenarierne og genopretter signaltaarnene
 * omkring det nye centrum.
 *
 *   node scripts/flyt-base.mjs 55.674928 9.347811 RAVNINGBROEN
 *
 * Kør derefter `npm run hent-kort`, så kortfilen dækker det nye område.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rod = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [lat, lon, label = 'RAVNINGBROEN'] = process.argv.slice(2);
const B = { lat: Number(lat), lon: Number(lon) };
if (!Number.isFinite(B.lat) || !Number.isFinite(B.lon)) {
  throw new Error('Brug: node scripts/flyt-base.mjs <lat> <lon> [label]');
}

for (const f of ['scenarios/nat.json', 'scenarios/generalprove.json']) {
  const sti = join(rod, f);
  const s = JSON.parse(readFileSync(sti, 'utf8'));
  s.base = { lat: B.lat, lon: B.lon, label, verificeret: false };
  writeFileSync(sti, `${JSON.stringify(s, null, 2)}\n`);
}

// Hjaelper: et punkt i en given afstand og retning fra det nye centrum.
const m = (d, b) => {
  const r = (b * Math.PI) / 180;
  return {
    lat: +(B.lat + (d * Math.cos(r)) / 111320).toFixed(6),
    lon: +(B.lon + (d * Math.sin(r)) / (111320 * Math.cos((B.lat * Math.PI) / 180))).toFixed(6),
  };
};
// Fire signaltaarne, ét i hver kvadrant (spektrum paa 90 grader). Positionen
// er midt i spektret; admin kan respawne dem inden for spektret.
const taarne = [0, 90, 180, 270].map((fra, i) => ({
  id: `taarn-${i + 1}`,
  titel: `TÅRN ${i + 1}`,
  vinkelFra: fra,
  vinkelTil: fra + 90,
  minM: 300,
  maksM: 800,
  ...m(600, fra + 45),
  kode: `kode-${i + 1}.png`,
}));

writeFileSync(
  join(rod, 'scenarios/signaltaarne.json'),
  `${JSON.stringify(
    { version: 1, aktiv: false, telefon: '', taarnLyd: 'Mulvappe kommunikation.m4a', taarne },
    null,
    2,
  )}\n`,
);
console.log(`Basen er flyttet til ${B.lat}, ${B.lon} (${label}).`);
