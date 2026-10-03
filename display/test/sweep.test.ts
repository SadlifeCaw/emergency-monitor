import { describe, expect, test } from 'vitest';
import { OMDREJNING_SEK, sweepvinkel } from '../src/kort/sweep.js';

const OMDREJNING_MS = OMDREJNING_SEK * 1000;

describe('sweepvinkel', () => {
  test('begynder i nord', () => {
    expect(sweepvinkel(0)).toBe(0);
  });

  test('er halvvejs rundt efter en halv omdrejning', () => {
    expect(sweepvinkel(OMDREJNING_MS / 2)).toBeCloseTo(180, 6);
  });

  test('er tilbage i nord efter en hel omdrejning', () => {
    expect(sweepvinkel(OMDREJNING_MS)).toBeCloseTo(0, 6);
  });

  test('ligger altid i intervallet 0-360', () => {
    for (let t = 0; t < OMDREJNING_MS * 3; t += 137) {
      const v = sweepvinkel(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(360);
    }
  });

  test('bevaeger sig jaevnt fra billede til billede ved 60 fps', () => {
    // Kernen i det hele: vinklen skal aendre sig lidt hvert 16. ms, ikke
    // springe 45 grader en gang i sekundet.
    const skridt = 1000 / 60;
    const forventet = (skridt / OMDREJNING_MS) * 360;

    for (let i = 0; i < 200; i += 1) {
      const a = sweepvinkel(i * skridt);
      const b = sweepvinkel((i + 1) * skridt);
      const forskel = ((b - a + 540) % 360) - 180;
      expect(forskel).toBeCloseTo(forventet, 6);
    }
  });

  test('springer aldrig mere end en grad pr. billede', () => {
    const skridt = 1000 / 60;
    for (let i = 0; i < 500; i += 1) {
      const a = sweepvinkel(i * skridt);
      const b = sweepvinkel((i + 1) * skridt);
      expect(Math.abs(((b - a + 540) % 360) - 180)).toBeLessThan(1);
    }
  });

  test('er monoton inden for en omdrejning', () => {
    let forrige = -1;
    for (let t = 0; t < OMDREJNING_MS; t += 50) {
      const v = sweepvinkel(t);
      expect(v).toBeGreaterThan(forrige);
      forrige = v;
    }
  });
});
