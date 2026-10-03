import { describe, expect, test } from 'vitest';
import { blokmeter, fastTal, forloebet, lokalTid } from '../src/format.js';

describe('lokalTid', () => {
  test('viser lokal tid, ikke UTC', () => {
    // Serveren sender UTC. En skaerm der viser 01:57, naar klokken er 03:57,
    // er direkte vildledende midt om natten.
    expect(lokalTid('2026-07-16T00:14:00Z', 'Europe/Copenhagen')).toBe('02:14:00');
  });

  test('bruger 24-timers ur', () => {
    expect(lokalTid('2026-07-16T21:05:09Z', 'Europe/Copenhagen')).toBe('23:05:09');
  });

  test('nulpolstrer, saa bredden aldrig hopper', () => {
    expect(lokalTid('2026-07-16T01:02:03Z', 'Europe/Copenhagen')).toBe('03:02:03');
  });

  test('kan udelade sekunder', () => {
    expect(lokalTid('2026-07-16T00:14:00Z', 'Europe/Copenhagen', false)).toBe('02:14');
  });
});

describe('fastTal', () => {
  test('holder fast bredde, saa tallene ikke hopper', () => {
    expect(fastTal(0.047, 1, 3)).toBe('0.047');
    expect(fastTal(0.9, 1, 3)).toBe('0.900');
  });

  test('nulpolstrer heltalsdelen', () => {
    expect(fastTal(7.4, 2, 1)).toBe('07.4');
    expect(fastTal(11.92, 2, 1)).toBe('11.9');
  });

  test('haandterer nul', () => {
    expect(fastTal(0, 3, 0)).toBe('000');
  });

  test('afkorter frem for at vokse ud over den aftalte bredde', () => {
    expect(fastTal(1234, 2, 0)).toBe('1234');
  });

  test('haandterer negative vaerdier', () => {
    expect(fastTal(-3.5, 2, 1)).toBe('-03.5');
  });
});

describe('blokmeter', () => {
  test('er tomt ved 0 procent', () => {
    expect(blokmeter(0, 10)).toBe('░░░░░░░░░░');
  });

  test('er fuldt ved 100 procent', () => {
    expect(blokmeter(100, 10)).toBe('██████████');
  });

  test('fylder halvdelen ved 50 procent', () => {
    expect(blokmeter(50, 10)).toBe('█████░░░░░');
  });

  test('holder altid den aftalte bredde', () => {
    for (const p of [0, 13, 34, 61, 88, 100]) {
      expect(blokmeter(p, 24)).toHaveLength(24);
    }
  });

  test('klipper vaerdier uden for 0-100', () => {
    expect(blokmeter(-20, 5)).toBe('░░░░░');
    expect(blokmeter(140, 5)).toBe('█████');
  });
});

describe('forloebet', () => {
  test('viser minutter og sekunder', () => {
    expect(forloebet(0)).toBe('00:00');
    expect(forloebet(95)).toBe('01:35');
    expect(forloebet(599)).toBe('09:59');
  });

  test('holder fast bredde, saa feltet ikke hopper', () => {
    expect(forloebet(5)).toHaveLength(5);
    expect(forloebet(3599)).toHaveLength(5);
  });

  test('gaar over til timer efter en time', () => {
    // Et vagthold der har vaeret ude i over en time, skal kunne se det.
    expect(forloebet(3600)).toBe('1:00:00');
    expect(forloebet(3725)).toBe('1:02:05');
  });

  test('taeller ikke baglaens', () => {
    expect(forloebet(-30)).toBe('00:00');
  });
});
