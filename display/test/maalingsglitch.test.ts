import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  lavMaalingsglitch,
  maalingsglitchAktiv,
  maalingsvarighed,
  naesteMaalingsglitch,
  MAALING_LAENGST_SEK,
  MAALING_MINDST_SEK,
} from '../src/maalingsglitch.js';

describe('maalingsglitchAktiv', () => {
  test('kraever at kontakten er til', () => {
    expect(maalingsglitchAktiv(false, 'ROLIG')).toBe(false);
    expect(maalingsglitchAktiv(true, 'ROLIG')).toBe(true);
  });

  test('er aldrig aktiv under en alarm', () => {
    expect(maalingsglitchAktiv(true, 'ALARM')).toBe(false);
  });

  test('virker ogsaa under optrapningen', () => {
    expect(maalingsglitchAktiv(true, 'OPTRAPNING')).toBe(true);
  });
});

describe('tider', () => {
  test('naeste udfald ligger inden for de aftalte graenser', () => {
    for (let i = 0; i < 200; i += 1) {
      const ms = naesteMaalingsglitch();
      expect(ms).toBeGreaterThanOrEqual(MAALING_MINDST_SEK * 1000);
      expect(ms).toBeLessThanOrEqual(MAALING_LAENGST_SEK * 1000);
    }
  });

  test('et udfald er kort', () => {
    for (let i = 0; i < 200; i += 1) expect(maalingsvarighed()).toBeLessThan(1200);
  });
});

const fejlfladen = (): HTMLElement => {
  const attr = new Map<string, string>();
  return {
    setAttribute: (n: string, v: string) => void attr.set(n, v),
    removeAttribute: (n: string) => void attr.delete(n),
    getAttribute: (n: string) => attr.get(n) ?? null,
    hasAttribute: (n: string) => attr.has(n),
  } as unknown as HTMLElement;
};

describe('lavMaalingsglitch', () => {
  let maal: HTMLElement[];

  beforeEach(() => {
    vi.useFakeTimers();
    // Kun attributterne bruges, saa der kraeves intet DOM i testen.
    maal = [fejlfladen(), fejlfladen()];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('glitcher og ordner sig selv igen, mens den er aktiv', () => {
    // Math.random() = 0 giver det korteste udfald og det tidligste foerste udfald.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const g = lavMaalingsglitch(maal);
    g.saet(true);
    vi.advanceTimersByTime(800);
    expect(maal.every((m) => m.getAttribute('data-maalingsfejl') === 'ja')).toBe(true);
    vi.advanceTimersByTime(450);
    expect(maal.some((m) => m.getAttribute('data-maalingsfejl') === 'ja')).toBe(false);
    g.stop();
  });

  test('rydder alt og holder stille, naar den slaas fra (fx ved alarm)', () => {
    const g = lavMaalingsglitch(maal);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    g.saet(true);
    vi.advanceTimersByTime(900);
    expect(maal.every((m) => m.getAttribute('data-maalingsfejl') === 'ja')).toBe(true);
    g.saet(false);
    expect(maal.some((m) => m.hasAttribute('data-maalingsfejl'))).toBe(false);
    vi.advanceTimersByTime(120_000);
    expect(maal.some((m) => m.hasAttribute('data-maalingsfejl'))).toBe(false);
  });
});
