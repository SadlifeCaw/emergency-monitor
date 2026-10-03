/**
 * Ravage: instruktoerernes mulighed for at saette systemet ud af drift.
 *
 * Kulten forstyrrer udstyret. Det er ikke en fejl, det er et virkemiddel -
 * og derfor skal det kunne slaas til og fra fra telefonen, midt i det hele.
 */

import { describe, expect, test } from 'vitest';
import { saetRavage, tomRavage } from '../src/motor/ravage.js';
import { bygTilstand } from './hjaelp/byg.js';

const T0 = Date.parse('2026-07-15T23:30:00+02:00');

describe('tomRavage', () => {
  test('alt er slaaet fra fra begyndelsen', () => {
    expect(tomRavage()).toEqual({
      sloeretKort: false,
      skjulKoordinat: false,
      glitch: false,
      maalingsfejl: false,
      lydFra: false,
    });
  });
});

describe('saetRavage', () => {
  const rolig = bygTilstand();

  test('slaar en enkelt ting til', () => {
    const r = saetRavage(rolig, { sloeretKort: true }, T0);
    expect(r.tilstand.ravage.sloeretKort).toBe(true);
    expect(r.tilstand.ravage.glitch).toBe(false);
  });

  test('lader de oevrige staa uroert', () => {
    let t = saetRavage(rolig, { glitch: true }, T0).tilstand;
    t = saetRavage(t, { sloeretKort: true }, T0).tilstand;
    expect(t.ravage).toMatchObject({ glitch: true, sloeretKort: true, skjulKoordinat: false });
  });

  test('slaar fra igen', () => {
    const paa = saetRavage(rolig, { glitch: true }, T0).tilstand;
    expect(saetRavage(paa, { glitch: false }, T0).tilstand.ravage.glitch).toBe(false);
  });

  test('muterer ikke den indkomne tilstand', () => {
    const frossen = structuredClone(rolig);
    saetRavage(rolig, { sloeretKort: true, glitch: true }, T0);
    expect(rolig).toEqual(frossen);
  });

  test('udsender en begivenhed, saa skiftet kan ses i loggen', () => {
    const r = saetRavage(rolig, { sloeretKort: true }, T0);
    expect(r.udgaaende).toHaveLength(1);
    expect(r.udgaaende[0]?.slags).toBe('RAVAGE_AENDRET');
  });

  test('siger ikke noget, naar intet aendrede sig', () => {
    // At trykke paa en knap, der allerede er slaaet til, er ikke en haendelse.
    const paa = saetRavage(rolig, { glitch: true }, T0).tilstand;
    expect(saetRavage(paa, { glitch: true }, T0).udgaaende).toEqual([]);
  });

  test('kan slaa alt fra paa én gang', () => {
    let t = saetRavage(rolig, { sloeretKort: true, skjulKoordinat: true, glitch: true }, T0)
      .tilstand;
    t = saetRavage(t, tomRavage(), T0).tilstand;
    expect(t.ravage).toEqual(tomRavage());
  });
});

describe('maalingsfejl', () => {
  const rolig = bygTilstand();

  test('kan slaas til uden at roere de andre kontakter', () => {
    const r = saetRavage(rolig, { maalingsfejl: true }, T0);
    expect(r.tilstand.ravage).toEqual({
      sloeretKort: false,
      skjulKoordinat: false,
      glitch: false,
      maalingsfejl: true,
      lydFra: false,
    });
    expect(r.udgaaende).toHaveLength(1);
  });

});

describe('lydFra', () => {
  test('kan slaas til og fra uden at roere de andre', () => {
    const rolig = bygTilstand();
    const paa = saetRavage(rolig, { lydFra: true }, T0).tilstand;
    expect(paa.ravage).toMatchObject({ lydFra: true, glitch: false, maalingsfejl: false });
    expect(saetRavage(paa, { lydFra: false }, T0).tilstand.ravage.lydFra).toBe(false);
  });
});
