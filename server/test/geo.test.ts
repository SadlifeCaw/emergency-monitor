import { describe, expect, test } from 'vitest';
import {
  afstandM,
  formaterDdm,
  indenforRadius,
  pejlingGrader,
  sektorFor,
} from '../src/motor/geo.js';
import { VORK } from './hjaelp/byg.js';

describe('afstandM', () => {
  test('returnerer 0 for samme punkt', () => {
    expect(afstandM(VORK, VORK)).toBe(0);
  });

  test('regner 0,01 grad nordpaa til ca. 1112 m', () => {
    const nord = { lat: VORK.lat + 0.01, lon: VORK.lon };
    expect(afstandM(VORK, nord)).toBeCloseTo(1112, -1);
  });

  test('regner 0,01 grad oestpaa til ca. 627 m paa Vorks breddegrad', () => {
    const oest = { lat: VORK.lat, lon: VORK.lon + 0.01 };
    expect(afstandM(VORK, oest)).toBeCloseTo(627, -1);
  });

  test('rammer det kendte alarmpunkt paa ca. 394 m', () => {
    // Kontrolvaerdi regnet i haanden med haversine, R = 6371 km.
    expect(afstandM(VORK, { lat: 55.6601, lon: 9.3648 })).toBeCloseTo(394, -1);
  });

  test('er symmetrisk', () => {
    const b = { lat: 55.6601, lon: 9.3648 };
    expect(afstandM(VORK, b)).toBeCloseTo(afstandM(b, VORK), 6);
  });
});

describe('pejlingGrader', () => {
  test('lige nord er 0 grader', () => {
    expect(pejlingGrader(VORK, { lat: VORK.lat + 0.01, lon: VORK.lon })).toBeCloseTo(0, 3);
  });

  test('lige oest er 90 grader', () => {
    expect(pejlingGrader(VORK, { lat: VORK.lat, lon: VORK.lon + 0.01 })).toBeCloseTo(90, 2);
  });

  test('lige syd er 180 grader', () => {
    expect(pejlingGrader(VORK, { lat: VORK.lat - 0.01, lon: VORK.lon })).toBeCloseTo(180, 3);
  });

  test('lige vest er 270 grader og ikke -90', () => {
    expect(pejlingGrader(VORK, { lat: VORK.lat, lon: VORK.lon - 0.01 })).toBeCloseTo(270, 2);
  });

  test('rammer det kendte alarmpunkt paa ca. 60 grader', () => {
    expect(pejlingGrader(VORK, { lat: 55.6601, lon: 9.3648 })).toBeCloseTo(59.6, 0);
  });

  test('ligger altid i intervallet 0-360', () => {
    for (let i = 0; i < 36; i += 1) {
      const v = (i * 10 * Math.PI) / 180;
      const maal = { lat: VORK.lat + 0.01 * Math.cos(v), lon: VORK.lon + 0.01 * Math.sin(v) };
      const p = pejlingGrader(VORK, maal);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(360);
    }
  });
});

describe('indenforRadius', () => {
  test('accepterer et punkt inden for graensen', () => {
    expect(indenforRadius(VORK, { lat: 55.6601, lon: 9.3648 }, 800)).toBe(true);
  });

  test('afviser et punkt uden for graensen', () => {
    // Vejle Fjord, ca. 8 km vaek. Det praecis taste-slip vi skal fange.
    expect(indenforRadius(VORK, { lat: 55.7, lon: 9.45 }, 800)).toBe(false);
  });

  test('er inklusiv paa selve graensen', () => {
    const nord = { lat: VORK.lat + 0.01, lon: VORK.lon };
    expect(indenforRadius(VORK, nord, afstandM(VORK, nord))).toBe(true);
  });
});

describe('sektorFor', () => {
  test('sektor 1 begynder i nord', () => {
    expect(sektorFor(0, 8)).toBe(1);
    expect(sektorFor(44.9, 8)).toBe(1);
  });

  test('taeller med uret', () => {
    expect(sektorFor(45, 8)).toBe(2);
    expect(sektorFor(90, 8)).toBe(3);
    expect(sektorFor(180, 8)).toBe(5);
    expect(sektorFor(359.9, 8)).toBe(8);
  });

  test('placerer det kendte alarmpunkt i sektor 2', () => {
    // Pejling 59,6 grader fra basen. Kilen og tallet skal vise det samme.
    expect(sektorFor(pejlingGrader(VORK, { lat: 55.6601, lon: 9.3648 }), 8)).toBe(2);
  });

  test('haandterer negative og overloebende pejlinger', () => {
    expect(sektorFor(-1, 8)).toBe(8);
    expect(sektorFor(360, 8)).toBe(1);
    expect(sektorFor(405, 8)).toBe(2);
  });

  test('virker med et andet antal sektorer', () => {
    expect(sektorFor(0, 4)).toBe(1);
    expect(sektorFor(91, 4)).toBe(2);
    expect(sektorFor(271, 4)).toBe(4);
  });

  test('ligger altid mellem 1 og antallet af sektorer', () => {
    for (let p = 0; p < 360; p += 0.5) {
      const s = sektorFor(p, 8);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(8);
    }
  });

  test('afviser et ugyldigt antal sektorer', () => {
    expect(() => sektorFor(0, 0)).toThrow(/sektorer/i);
    expect(() => sektorFor(0, 2.5)).toThrow(/sektorer/i);
  });
});

describe('formaterDdm', () => {
  test('formaterer Vork som grader og decimalminutter', () => {
    // Skal kunne skrives af i moerke fra 3 meters afstand.
    expect(formaterDdm(VORK)).toBe("55°39.499'N 009°21.563'E");
  });

  test('nulpolstrer laengdegraden til tre cifre', () => {
    expect(formaterDdm({ lat: 55, lon: 9 })).toBe("55°00.000'N 009°00.000'E");
  });

  test('haandterer syd og vest', () => {
    expect(formaterDdm({ lat: -33.5, lon: -70.25 })).toBe("33°30.000'S 070°15.000'W");
  });
});
