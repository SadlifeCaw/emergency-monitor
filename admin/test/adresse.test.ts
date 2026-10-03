import { describe, expect, test } from 'vitest';
import { AdresseFejl, hentKoordinat, opslagUrl, soegAdresse, soegUrl } from '../src/adresse.js';
import type { Hent } from '../src/adresse.js';
import { utm32TilGrader } from '../src/utm.js';

const svar =
  (data: unknown, ok = true): Hent =>
  async () => ({ ok, json: async () => data });

describe('utm32TilGrader', () => {
  test('rammer Vork Bakker 12 (kontrolleret mod live Adressevaelger)', () => {
    const { lat, lon } = utm32TilGrader(522611.35, 6168110.08);
    expect(lat).toBeCloseTo(55.65831, 4);
    expect(lon).toBeCloseTo(9.359385, 4);
  });

  test('midtermeridianen 9 grader giver praecis laengde 9', () => {
    expect(utm32TilGrader(500000, 6200000).lon).toBeCloseTo(9, 8);
  });
});

describe('soegAdresse', () => {
  test('giver titel og id', async () => {
    const r = await soegAdresse(
      'Vork Bakker 12',
      svar({ status: 'ok', fund: [{ type: 'husnummer', id: 'abc', titel: 'Vork Bakker 12, 7100 Vejle' }] }),
    );
    expect(r).toEqual([{ navn: 'Vork Bakker 12, 7100 Vejle', id: 'abc' }]);
  });

  test('frasorterer traef uden id eller titel', async () => {
    const r = await soegAdresse(
      'noget',
      svar({ fund: [{ titel: 'A' }, { id: 'x' }, { id: 'b', titel: 'B' }] }),
    );
    expect(r).toEqual([{ navn: 'B', id: 'b' }]);
  });

  test('afviser en for kort soegning uden at ringe ud', async () => {
    let kaldt = false;
    const hent: Hent = async () => {
      kaldt = true;
      return { ok: true, json: async () => ({}) };
    };
    await expect(soegAdresse('ab', hent)).rejects.toThrow(AdresseFejl);
    expect(kaldt).toBe(false);
  });

  test('forklarer, at nettet er vaek', async () => {
    const hent: Hent = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(soegAdresse('Vork Bakker', hent)).rejects.toThrow(/Ingen forbindelse/);
  });

  test('forklarer en fejlstatus og et uventet svar', async () => {
    await expect(soegAdresse('Vork Bakker', svar({}, false))).rejects.toThrow(/fejlede/);
    await expect(soegAdresse('Vork Bakker', svar({ status: 'fejl' }))).rejects.toThrow(/Uventet/);
  });

  test('url bruger tekst, token og et loft paa antal', () => {
    const url = new URL(soegUrl('Vork Bakker 12'));
    expect(url.origin).toBe('https://adressevaelger.dk');
    expect(url.pathname).toBe('/husnumre/soeg');
    expect(url.searchParams.get('tekst')).toBe('Vork Bakker 12');
    expect(url.searchParams.get('token')).toBe('adressevaelger123');
  });
});

describe('hentKoordinat', () => {
  const husnummer = { husnummer: { adgangspunkt: { koordinater: { x: 522611.35, y: 6168110.08 } } } };

  test('regner adgangspunktet om til grader', async () => {
    const g = await hentKoordinat('abc', svar(husnummer));
    expect(g.lat).toBeCloseTo(55.65831, 4);
    expect(g.lon).toBeCloseTo(9.359385, 4);
  });

  test('siger fra, naar adressen mangler koordinat', async () => {
    await expect(hentKoordinat('abc', svar({ husnummer: {} }))).rejects.toThrow(/intet koordinat/);
  });

  test('url indeholder id og token', () => {
    expect(opslagUrl('abc')).toBe('https://adressevaelger.dk/husnumre/abc?token=adressevaelger123');
  });
});
