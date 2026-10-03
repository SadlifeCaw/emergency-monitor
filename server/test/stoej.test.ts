import { describe, expect, test } from 'vitest';
import { enhedsStoej, hash32, tekstHash, vaelg } from '../src/motor/stoej.js';

describe('hash32', () => {
  test('er deterministisk for samme noegler', () => {
    expect(hash32(20260715, 3, 41)).toBe(hash32(20260715, 3, 41));
  });

  test('giver forskellige vaerdier for forskellige noegler', () => {
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(hash32(1, 2, 3)).not.toBe(hash32(2, 2, 3));
  });

  test('returnerer et uint32', () => {
    for (let i = 0; i < 200; i += 1) {
      const v = hash32(20260715, i);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('enhedsStoej', () => {
  test('ligger altid i intervallet 0 til 1', () => {
    for (let i = 0; i < 2000; i += 1) {
      const v = enhedsStoej(20260715, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('er deterministisk - generalproeven og natten ser ens ud', () => {
    const foerste = Array.from({ length: 50 }, (_, i) => enhedsStoej(20260715, 1, i));
    const anden = Array.from({ length: 50 }, (_, i) => enhedsStoej(20260715, 1, i));
    expect(anden).toEqual(foerste);
  });

  test('er nogenlunde jaevnt fordelt', () => {
    const n = 20000;
    let sum = 0;
    const spande = new Array<number>(10).fill(0);
    for (let i = 0; i < n; i += 1) {
      const v = enhedsStoej(4242, i);
      sum += v;
      spande[Math.floor(v * 10)] = (spande[Math.floor(v * 10)] ?? 0) + 1;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const antal of spande) {
      expect(antal).toBeGreaterThan(n / 10 / 2);
      expect(antal).toBeLessThan((n / 10) * 2);
    }
  });

  test('et andet seed giver et andet forloeb', () => {
    const a = Array.from({ length: 20 }, (_, i) => enhedsStoej(1, i));
    const b = Array.from({ length: 20 }, (_, i) => enhedsStoej(2, i));
    expect(b).not.toEqual(a);
  });
});

describe('vaelg', () => {
  const pulje = ['SWEEP SEKTOR 1', 'SWEEP SEKTOR 2', 'BASELINE OK', 'INTET AT BEMAERKE'] as const;

  test('vaelger deterministisk ud fra noeglerne', () => {
    expect(vaelg(pulje, 7, 3)).toBe(vaelg(pulje, 7, 3));
  });

  test('vaelger altid et element fra puljen', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(pulje).toContain(vaelg(pulje, 20260715, i));
    }
  });

  test('rammer alle elementer over tid', () => {
    const set = new Set(Array.from({ length: 500 }, (_, i) => vaelg(pulje, 1, i)));
    expect(set.size).toBe(pulje.length);
  });

  test('afviser en tom pulje i stedet for at returnere undefined', () => {
    expect(() => vaelg([], 1, 2)).toThrow(/tom/i);
  });
});

describe('tekstHash', () => {
  test('er deterministisk', () => {
    expect(tekstHash('anomali-1')).toBe(tekstHash('anomali-1'));
  });

  test('giver forskellige tal for forskellige tekster', () => {
    expect(tekstHash('anomali-1')).not.toBe(tekstHash('anomali-2'));
    expect(tekstHash('melding-arkiv')).not.toBe(tekstHash('melding-arkiiv'));
  });

  test('returnerer et uint32', () => {
    for (const t of ['', 'a', 'anomali-1', 'et-noget-laengere-haendelses-id']) {
      const v = tekstHash(t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  test('kan bruges som noegle sammen med hash32', () => {
    expect(hash32(tekstHash('a1'), 7)).not.toBe(hash32(tekstHash('a2'), 7));
  });
});
