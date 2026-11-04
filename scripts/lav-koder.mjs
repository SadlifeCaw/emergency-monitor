/**
 * Laver pladsholder-koder til udvidelsespakken: assets/koder/kode-1.png ... kode-N.png
 *
 * Det er IKKE de rigtige koder. Laeg jeres egne PNG-filer i assets/koder/ - samme
 * filnavn overskriver pladsholderen. Hver pladsholder er en gitterfigur, der kan
 * kendes fra de andre, saa man kan se at forloebet virker.
 *
 *   node scripts/lav-koder.mjs          # 5 stk.
 *   node scripts/lav-koder.mjs 8        # 8 stk.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const rod = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mappe = join(rod, 'assets', 'koder');
const antal = Number(process.argv[2] ?? 5);

const CELLE = 24;
const GITTER = 9;
const SIDE = CELLE * GITTER;

const crcTabel = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabel[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const blok = (type, data) => {
  const hoved = Buffer.alloc(4);
  hoved.writeUInt32BE(data.length);
  const typeOgData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(typeOgData));
  return Buffer.concat([hoved, typeOgData, sum]);
};

/** Et deterministisk monster pr. nummer: hjoerner fast, resten afhaenger af n. */
const celle = (x, y, n) => {
  const hjoerne = (x < 2 || x >= GITTER - 2) && (y < 2 || y >= GITTER - 2);
  if (hjoerne) return true;
  const h = Math.imul(x * 31 + y * 17 + n * 101, 2654435761) >>> 0;
  return (h >>> 7) % 2 === 0;
};

const png = (n) => {
  const raekker = [];
  for (let py = 0; py < SIDE; py += 1) {
    const r = Buffer.alloc(1 + SIDE);
    for (let px = 0; px < SIDE; px += 1) {
      const sort = celle(Math.floor(px / CELLE), Math.floor(py / CELLE), n);
      r[1 + px] = sort ? 0 : 255;
    }
    raekker.push(r);
  }

  const hoved = Buffer.alloc(13);
  hoved.writeUInt32BE(SIDE, 0);
  hoved.writeUInt32BE(SIDE, 4);
  hoved[8] = 8; // bitdybde
  hoved[9] = 0; // graaskala

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blok('IHDR', hoved),
    blok('IDAT', deflateSync(Buffer.concat(raekker))),
    blok('IEND', Buffer.alloc(0)),
  ]);
};

mkdirSync(mappe, { recursive: true });
for (let n = 1; n <= antal; n += 1) {
  writeFileSync(join(mappe, `kode-${n}.png`), png(n));
}
console.log(`${antal} pladsholder-koder skrevet til ${mappe}`);
