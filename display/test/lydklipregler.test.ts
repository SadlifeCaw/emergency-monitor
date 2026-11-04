import { describe, expect, test } from 'vitest';
import type { Skaermbillede } from '../src/kontrakt.js';
import {
  OPBYGNING_SEK,
  erForbi,
  medFuldDekryptering,
  opbygningFor,
  startforskydningSek,
} from '../src/lydklipregler.js';

const billede = { dekryptering: { procent: 42, fragment: 'abc' } } as unknown as Skaermbillede;

describe('startforskydning', () => {
  test('friskt klip spilles fra start', () => {
    expect(startforskydningSek(0)).toBe(0);
    expect(startforskydningSek(2)).toBe(0);
  });
  test('genindlaest midt i klippet genoptages', () => {
    expect(startforskydningSek(31)).toBe(31);
  });
});

describe('erForbi', () => {
  test('ukendt laengde er ikke forbi', () => expect(erForbi(500, null)).toBe(false));
  test('forbi naar forskydningen naar enden', () => {
    expect(erForbi(30, 30)).toBe(true);
    expect(erForbi(29, 30)).toBe(false);
  });
});

describe('medFuldDekryptering', () => {
  test('100 % mens klippet spiller, fragmentet uaendret', () => {
    const s = medFuldDekryptering(billede, 1);
    expect(s.dekryptering).toEqual({ procent: 100, fragment: 'abc' });
  });
  test('loeber op under opbygningen', () => {
    expect(medFuldDekryptering(billede, 0).dekryptering.procent).toBe(42);
    expect(medFuldDekryptering(billede, 0.5).dekryptering.procent).toBe(71);
  });
  test('uroert uden klip', () => {
    expect(medFuldDekryptering(billede, null)).toBe(billede);
  });
});

describe('opbygning', () => {
  test('springes over ved genoptagelse midt i klippet', () => {
    expect(opbygningFor(0)).toBe(OPBYGNING_SEK);
    expect(opbygningFor(40)).toBe(0);
  });
});
