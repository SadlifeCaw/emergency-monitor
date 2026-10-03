import { describe, expect, test } from 'vitest';
import {
  naesteGlitch,
  foersteGlitch,
  GLITCH_MINDST_SEK,
  GLITCH_LAENGST_SEK,
  VARIGHED_MS,
} from '../src/glitch.js';

describe('naesteGlitch', () => {
  test('venter mellem det aftalte mindste og laengste', () => {
    for (let i = 0; i < 300; i += 1) {
      const ms = naesteGlitch();
      expect(ms).toBeGreaterThanOrEqual(GLITCH_MINDST_SEK * 1000);
      expect(ms).toBeLessThanOrEqual(GLITCH_LAENGST_SEK * 1000);
    }
  });

  test('venter forskelligt fra gang til gang', () => {
    // Et fast interval ville hurtigt blive genkendeligt, og saa holder det op
    // med at foeles som en fejl paa udstyret.
    const set = new Set(Array.from({ length: 40 }, () => naesteGlitch()));
    expect(set.size).toBeGreaterThan(20);
  });

  test('lader skaermen staa mindst ti gange saa laenge som den saetter ud', () => {
    // Kravet er ikke et bestemt antal sekunder, men at vagtholdet kan naa at
    // laese et koordinat mellem to udfald. Udtrykt som forholdet mellem pause og
    // anfald overlever kravet, at frekvensen justeres.
    expect(GLITCH_MINDST_SEK * 1000).toBeGreaterThanOrEqual(VARIGHED_MS * 10);
  });
});

describe('foersteGlitch', () => {
  test('kommer hurtigere end den normale pause, saa kontakten kvitterer', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(foersteGlitch()).toBeLessThan(GLITCH_MINDST_SEK * 1000);
    }
  });
});
