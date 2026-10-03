import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  LagerFejl,
  gemTilstand,
  laesTilstand,
  sletTilstand,
} from '../src/lager/tilstandslager.js';
import { bygTilstand, iso, T0, min } from './hjaelp/byg.js';

let mappe = '';
let sti = '';

beforeEach(async () => {
  mappe = await mkdtemp(join(tmpdir(), 'natvagt-'));
  sti = join(mappe, 'runtime.json');
});

afterEach(async () => {
  await rm(mappe, { recursive: true, force: true });
});

describe('laesTilstand', () => {
  test('giver null naar filen ikke findes endnu', async () => {
    await expect(laesTilstand(sti)).resolves.toBeNull();
  });

  test('laeser det der blev gemt', async () => {
    const tilstand = bygTilstand({ fase: 'ALARM', vagthold: 'B' });
    await gemTilstand(sti, tilstand);
    await expect(laesTilstand(sti)).resolves.toEqual(tilstand);
  });

  test('bevarer aktivAlarm og fyrede gennem en runde paa disken', async () => {
    const tilstand = bygTilstand({
      fase: 'ALARM',
      fyrede: { 'a1': { fyretKl: iso(T0), oploestKl: null } },
      aktivAlarm: { haendelseId: 'alarm-hoved', fyretKl: iso(T0 + min(164)), kvitteretKl: null },
      dekrypteringProcent: 68,
      dekrypteringFragment: 'det sjette',
    });
    await gemTilstand(sti, tilstand);
    const igen = await laesTilstand(sti);
    expect(igen).toEqual(tilstand);
  });
});

describe('gemTilstand', () => {
  test('overskriver en tidligere tilstand', async () => {
    await gemTilstand(sti, bygTilstand({ vagthold: 'A' }));
    await gemTilstand(sti, bygTilstand({ vagthold: 'C' }));
    expect((await laesTilstand(sti))?.vagthold).toBe('C');
  });

  test('gemmer den forrige version som sikkerhedskopi', async () => {
    await gemTilstand(sti, bygTilstand({ vagthold: 'A' }));
    await gemTilstand(sti, bygTilstand({ vagthold: 'C' }));
    const bak = JSON.parse(await readFile(`${sti}.bak`, 'utf8'));
    expect(bak.vagthold).toBe('A');
  });

  test('efterlader ingen tmp-fil naar skrivningen lykkes', async () => {
    await gemTilstand(sti, bygTilstand());
    await expect(readFile(`${sti}.tmp`, 'utf8')).rejects.toThrow();
  });

  test('opretter mappen hvis den mangler', async () => {
    const dyb = join(mappe, 'state', 'runtime.json');
    await gemTilstand(dyb, bygTilstand({ vagthold: 'D' }));
    expect((await laesTilstand(dyb))?.vagthold).toBe('D');
  });
});

describe('robusthed mod afbrudt skrivning', () => {
  test('en efterladt tmp-fil paavirker ikke laesningen', async () => {
    // Stroemmen gik praecis mellem skriv og rename.
    await gemTilstand(sti, bygTilstand({ vagthold: 'A' }));
    await writeFile(`${sti}.tmp`, '{ halvfaerdig', 'utf8');
    expect((await laesTilstand(sti))?.vagthold).toBe('A');
  });

  test('falder tilbage paa sikkerhedskopien hvis hovedfilen er ulaeselig', async () => {
    await gemTilstand(sti, bygTilstand({ vagthold: 'A' }));
    await gemTilstand(sti, bygTilstand({ vagthold: 'C' }));
    await writeFile(sti, '{ noget gik galt kl. 03', 'utf8');
    expect((await laesTilstand(sti))?.vagthold).toBe('A');
  });

  test('kaster en laesbar fejl hvis baade fil og sikkerhedskopi er oedelagt', async () => {
    await gemTilstand(sti, bygTilstand());
    await writeFile(sti, 'skrald', 'utf8');
    await writeFile(`${sti}.bak`, 'ogsaa skrald', 'utf8');
    await expect(laesTilstand(sti)).rejects.toThrow(LagerFejl);
    await expect(laesTilstand(sti)).rejects.toThrow(/tilstand/i);
  });

  test('afviser en fil der ikke ligner en tilstand', async () => {
    await writeFile(sti, JSON.stringify({ noget: 'helt andet' }), 'utf8');
    await expect(laesTilstand(sti)).rejects.toThrow(LagerFejl);
  });
});

describe('sletTilstand', () => {
  test('fjerner baade filen og sikkerhedskopien', async () => {
    await gemTilstand(sti, bygTilstand({ vagthold: 'A' }));
    await gemTilstand(sti, bygTilstand({ vagthold: 'B' }));

    await sletTilstand(sti);

    await expect(laesTilstand(sti)).resolves.toBeNull();
    await expect(readFile(`${sti}.bak`, 'utf8')).rejects.toThrow();
  });

  test('klager ikke over en tilstand der ikke findes', async () => {
    await expect(sletTilstand(sti)).resolves.toBeUndefined();
  });
});
