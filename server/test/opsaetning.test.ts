/**
 * Opsaetningen i Radar.exe: at laese et koordinat, som det kopieres fra Google Maps.
 */

import { describe, expect, test } from 'vitest';
import { nytValg, standardTaarne, tolkKoordinat } from '../src/pakke/opsaetning.js';
import { bbox } from '../src/pakke/kort.js';
import { adminLink, bedsteAdresse } from '../src/pakke/visning.js';

describe('tolkKoordinat', () => {
  test('laeser det, Google Maps kopierer', () => {
    expect(tolkKoordinat('55.674928, 9.347811')).toEqual({ lat: 55.674928, lon: 9.347811 });
  });

  test('klarer blanke imellem og danske decimalkommaer', () => {
    expect(tolkKoordinat('55.67 9.35')).toEqual({ lat: 55.67, lon: 9.35 });
    expect(tolkKoordinat('55,6749 9,3478')).toEqual({ lat: 55.6749, lon: 9.3478 });
  });

  test('klarer negative tal', () => {
    expect(tolkKoordinat('-33.86, 151.21')).toEqual({ lat: -33.86, lon: 151.21 });
  });

  test('afviser noget der ikke er to tal i rimelige graenser', () => {
    expect(tolkKoordinat('')).toBeNull();
    expect(tolkKoordinat('Vejle')).toBeNull();
    expect(tolkKoordinat('55.6')).toBeNull();
    expect(tolkKoordinat('55.6, 9.3, 12')).toBeNull();
    expect(tolkKoordinat('95, 9')).toBeNull();
    expect(tolkKoordinat('55, 200')).toBeNull();
  });
});

describe('valg og kort', () => {
  test('navnet faar store bogstaver, en graense og et standardnavn', () => {
    const k = { lat: 55, lon: 9 };
    expect(nytValg(k, 'ravningbroen').navn).toBe('RAVNINGBROEN');
    expect(nytValg(k, '   ').navn).toBe('CENTRUM');
    expect(nytValg(k, 'x'.repeat(80)).navn).toHaveLength(30);
  });

  test('adgangskoden er lang nok og ny hver gang', () => {
    const k = { lat: 55, lon: 9 };
    const a = nytValg(k, '');
    expect(a.token.length).toBeGreaterThanOrEqual(16);
    expect(nytValg(k, '').token).not.toBe(a.token);
  });

  test('fire signaltaarne, ét i hver kvadrant, uden kode', () => {
    const t = standardTaarne({ lat: 55.67, lon: 9.34 });
    expect(t.map((x) => x.vinkelFra)).toEqual([0, 90, 180, 270]);
    expect(t.every((x) => x.kode === null && x.maksM <= 800)).toBe(true);
  });

  test('kortudsnittet ligger centreret om punktet', () => {
    const [vest, syd, oest, nord] = bbox({ lat: 55, lon: 9 }, 1000).split(',').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    expect((vest + oest) / 2).toBeCloseTo(9, 5);
    expect((syd + nord) / 2).toBeCloseTo(55, 5);
    expect(nord - syd).toBeCloseTo((2 * 1000) / 111_320, 4);
  });
});

describe('admin-linket', () => {
  test('vaelger hjemmenettet foer andre adresser', () => {
    const liste = [
      { kort: 'virtuel', adresse: '172.20.0.1' },
      { kort: 'Wi-Fi', adresse: '192.168.0.4' },
    ];
    expect(bedsteAdresse(liste)?.adresse).toBe('192.168.0.4');
    expect(bedsteAdresse([])).toBeUndefined();
  });

  test('indeholder adressen, porten og koden', () => {
    expect(adminLink('192.168.0.4', 8477, 'abc')).toBe('http://192.168.0.4:8477/admin/?token=abc');
  });
});
