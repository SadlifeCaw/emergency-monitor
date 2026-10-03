import { describe, expect, test } from 'vitest';
import { AdresseFejl, bygUrl, soegAdresse } from '../src/adresse.js';
import type { Hent } from '../src/adresse.js';

const BASE = { lat: 55.65831, lon: 9.359385 };
const svar =
  (data: unknown, ok = true): Hent =>
  async () => ({ ok, json: async () => data });

describe('soegAdresse', () => {
  test('giver navn og koordinater som tal', async () => {
    const r = await soegAdresse(
      'Vork Bakker 12',
      BASE,
      svar([{ display_name: '12, Vork Bakker, Vejle', lat: '55.6583100', lon: '9.3593850' }]),
    );
    expect(r).toEqual([{ navn: '12, Vork Bakker, Vejle', lat: 55.65831, lon: 9.359385 }]);
  });

  test('frasorterer traef uden brugbart koordinat', async () => {
    const r = await soegAdresse(
      'noget',
      BASE,
      svar([
        { display_name: 'A', lat: 'x', lon: '1' },
        { display_name: 'B', lat: '1', lon: '2' },
      ]),
    );
    expect(r.map((t) => t.navn)).toEqual(['B']);
  });

  test('afviser en for kort soegning uden at ringe ud', async () => {
    let kaldt = false;
    const hent: Hent = async () => {
      kaldt = true;
      return { ok: true, json: async () => [] };
    };
    await expect(soegAdresse('ab', BASE, hent)).rejects.toThrow(AdresseFejl);
    expect(kaldt).toBe(false);
  });

  test('forklarer, at nettet er vaek', async () => {
    const hent: Hent = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(soegAdresse('Vork Bakker', BASE, hent)).rejects.toThrow(/Ingen forbindelse/);
  });

  test('forklarer en fejlstatus', async () => {
    await expect(soegAdresse('Vork Bakker', BASE, svar([], false))).rejects.toThrow(/fejlede/);
  });

  test('url indeholder soegning, Danmark og et omraade omkring basen', () => {
    const url = new URL(bygUrl('Vork Bakker 12', BASE));
    expect(url.searchParams.get('q')).toBe('Vork Bakker 12');
    expect(url.searchParams.get('countrycodes')).toBe('dk');
    expect(url.searchParams.get('viewbox')).toContain('9.109385');
  });
});
