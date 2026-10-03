import { describe, expect, test } from 'vitest';
import { punktIRetning, ringradier, sektorlinjer, sektormidte } from '../src/kort/geometri.js';

const VORK = { lat: 55.65831, lon: 9.359385 };

describe('punktIRetning', () => {
  test('nord flytter kun breddegraden', () => {
    const p = punktIRetning(VORK, 0, 1112);
    expect(p.lat).toBeCloseTo(VORK.lat + 0.01, 4);
    expect(p.lon).toBeCloseTo(VORK.lon, 5);
  });

  test('syd flytter den anden vej', () => {
    const p = punktIRetning(VORK, 180, 1112);
    expect(p.lat).toBeCloseTo(VORK.lat - 0.01, 4);
    expect(p.lon).toBeCloseTo(VORK.lon, 5);
  });

  test('oest flytter kun laengdegraden paa Vorks breddegrad', () => {
    const p = punktIRetning(VORK, 90, 627);
    expect(p.lon).toBeCloseTo(VORK.lon + 0.01, 4);
    expect(p.lat).toBeCloseTo(VORK.lat, 4);
  });

  test('vest flytter modsat oest', () => {
    const oest = punktIRetning(VORK, 90, 627);
    const vest = punktIRetning(VORK, 270, 627);
    expect(VORK.lon - vest.lon).toBeCloseTo(oest.lon - VORK.lon, 6);
  });

  test('rammer det kendte alarmpunkt ud fra afstand og pejling', () => {
    // 394 m i pejling 59,6 grader skal give alarmkoordinatet tilbage.
    const p = punktIRetning(VORK, 59.63, 394);
    expect(p.lat).toBeCloseTo(55.6601, 4);
    expect(p.lon).toBeCloseTo(9.3648, 4);
  });

  test('afstand 0 giver udgangspunktet', () => {
    const p = punktIRetning(VORK, 137, 0);
    expect(p.lat).toBeCloseTo(VORK.lat, 9);
    expect(p.lon).toBeCloseTo(VORK.lon, 9);
  });
});

describe('ringradier', () => {
  test('giver 200, 400 og 800 m ved en alarmradius paa 800', () => {
    expect(ringradier(800)).toEqual([200, 400, 800]);
  });

  test('foelger med hvis fase 0 aendrer alarmradius', () => {
    expect(ringradier(1200)).toEqual([300, 600, 1200]);
  });

  test('yderste ring er altid selve alarmradius', () => {
    for (const r of [400, 800, 1500, 2000]) {
      expect(ringradier(r).at(-1)).toBe(r);
    }
  });

  test('radierne er stigende', () => {
    const r = ringradier(800);
    expect(r).toEqual([...r].sort((a, b) => a - b));
  });
});

describe('sektorlinjer', () => {
  test('giver én linje pr. sektorgraense', () => {
    expect(sektorlinjer(VORK, 8, 800)).toHaveLength(8);
  });

  test('foerste graense peger lige nord', () => {
    const [foerste] = sektorlinjer(VORK, 8, 800);
    expect(foerste?.pejling).toBe(0);
    expect(foerste?.til.lon).toBeCloseTo(VORK.lon, 5);
    expect(foerste?.til.lat).toBeGreaterThan(VORK.lat);
  });

  test('graenserne er jaevnt fordelt', () => {
    expect(sektorlinjer(VORK, 8, 800).map((l) => l.pejling)).toEqual([
      0, 45, 90, 135, 180, 225, 270, 315,
    ]);
  });

  test('alle linjer begynder i basen', () => {
    for (const linje of sektorlinjer(VORK, 8, 800)) {
      expect(linje.fra).toEqual(VORK);
    }
  });

  test('virker med et andet antal sektorer', () => {
    expect(sektorlinjer(VORK, 4, 800).map((l) => l.pejling)).toEqual([0, 90, 180, 270]);
  });
});

describe('sektormidte', () => {
  test('sektor 1 har midte i 22,5 grader med 8 sektorer', () => {
    expect(sektormidte(1, 8)).toBe(22.5);
  });

  test('sektor 2 - hvor alarmen ligger - har midte i 67,5 grader', () => {
    expect(sektormidte(2, 8)).toBe(67.5);
  });

  test('sidste sektor ligger under 360 grader', () => {
    expect(sektormidte(8, 8)).toBe(337.5);
  });
});
