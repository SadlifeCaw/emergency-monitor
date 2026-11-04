/**
 * Radar.exe's grafiske opstart: adgang, kortets fremdrift og opsaetningsjobbet.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { erLokal, lavOpsaetningsjob } from '../src/pakke/gui.js';
import { procentFra } from '../src/pakke/kort.js';

describe('erLokal', () => {
  test('kun maskinen selv', () => {
    expect(erLokal('127.0.0.1')).toBe(true);
    expect(erLokal('::1')).toBe(true);
    expect(erLokal('::ffff:127.0.0.1')).toBe(true);
    expect(erLokal('192.168.0.4')).toBe(false);
    expect(erLokal(undefined)).toBe(false);
  });
});

describe('procentFra', () => {
  test('finder det sidste procenttal i go-pmtiles\' statuslinje', () => {
    expect(procentFra('fetching chunks  46% |███   | (1.3/2.8 MB)')).toBe(46);
    expect(procentFra('fetching chunks  18%\rfetching chunks  26%')).toBe(26);
    expect(procentFra('fetching 8 dirs, 8 chunks')).toBeNull();
    expect(procentFra('300%')).toBeNull();
  });
});

describe('opsaetningsjob', () => {
  let rod = '';

  beforeEach(async () => {
    rod = await mkdtemp(join(tmpdir(), 'radar-gui-'));
  });
  afterEach(async () => {
    await rm(rod, { recursive: true, force: true });
  });

  test('begynder i "opsaetning" uden valg', () => {
    const info = lavOpsaetningsjob(rod, 8477).info();
    expect(info).toMatchObject({ tilstand: 'opsaetning', valg: null, fremdrift: null, admin: null });
  });

  test('et ugyldigt koordinat afvises med en forstaaelig besked', () => {
    const job = lavOpsaetningsjob(rod, 8477);
    job.start({ lat: 200, lon: 9, navn: '' });
    expect(job.info().tilstand).toBe('opsaetning');
    expect(job.info().fejl).toMatch(/ikke gyldigt/);

    job.start({ lat: Number.NaN, lon: 9, navn: '' });
    expect(job.info().fejl).toMatch(/ikke gyldigt/);
  });

  test('et gyldigt koordinat gemmer valget og gaar i gang med at hente kortet', async () => {
    // Ingen scenarie i den tomme mappe: jobbet fejler pænt i stedet for at kaste.
    const job = lavOpsaetningsjob(rod, 8477);
    job.start({ lat: 55.67, lon: 9.34, navn: 'test' });
    expect(job.info().tilstand).toBe('arbejder');

    await new Promise((klar) => setTimeout(klar, 300));
    const info = job.info();
    expect(info.tilstand).toBe('opsaetning');
    expect(info.fejl).toMatch(/mislykkedes/);

    const valg = JSON.parse(await readFile(join(rod, 'radar.json'), 'utf8')) as { navn: string };
    expect(valg.navn).toBe('TEST');
  });
});
