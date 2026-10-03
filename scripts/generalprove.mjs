#!/usr/bin/env node
/**
 * Generalproeve: afspiller hele natten tidskomprimeret.
 *
 * Samme kode som den rigtige nat - kun uret er skruet op. Tilstanden nulstilles
 * hver gang, saa proeven altid begynder forfra ved vagtstart.
 *
 * Brug:
 *   npm run generalprove          # 60x - hele natten paa 5,5 minut, alarm efter 2:44
 *   npm run generalprove -- 300   # 300x - hele natten paa 66 sekunder
 */

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROD = resolve(import.meta.dirname, '..');
const hastighed = process.argv[2] ?? '60';

const TILSTAND = resolve(ROD, 'state/generalprove.json');
await rm(TILSTAND, { force: true });
await rm(`${TILSTAND}.bak`, { force: true });

process.env.NATVAGT_SCENARIE = 'scenarios/generalprove.json';
process.env.NATVAGT_TILSTAND = 'state/generalprove.json';
process.env.NATVAGT_HASTIGHED = hastighed;
process.env.NATVAGT_VIRTUEL_START = '2026-07-15T23:30:00+02:00';

const alarmEfter = Math.round((164 * 60) / Number(hastighed));
process.stdout.write(`
  GENERALPROEVE - ${hastighed}x

  Vagten begynder 23.30. Alarmen falder kl. 02.14,
  altsaa ca. ${alarmEfter} sekunder inde i proeven.

  Aabn:  http://localhost:8477

`);

await import('../server/src/index.ts');
