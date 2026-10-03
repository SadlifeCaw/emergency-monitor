import { describe, expect, test } from 'vitest';
import { komprimeretUr, systemUr, testUr } from '../src/motor/ur.js';
import { T0, min, sek } from './hjaelp/byg.js';

describe('systemUr', () => {
  test('foelger vaegguret', () => {
    const foer = Date.now();
    const naa = systemUr().naa();
    expect(naa).toBeGreaterThanOrEqual(foer);
    expect(naa).toBeLessThanOrEqual(Date.now());
  });
});

describe('testUr', () => {
  test('staar stille indtil det spoles', () => {
    const ur = testUr(T0);
    expect(ur.naa()).toBe(T0);
    expect(ur.naa()).toBe(T0);
  });

  test('spoler frem med det angivne antal millisekunder', () => {
    const ur = testUr(T0);
    ur.spol(sek(90));
    expect(ur.naa()).toBe(T0 + sek(90));
  });

  test('kan saettes til et bestemt tidspunkt', () => {
    const ur = testUr(T0);
    ur.saet(T0 + min(164));
    expect(ur.naa()).toBe(T0 + min(164));
  });
});

describe('komprimeretUr', () => {
  test('gaar 60 gange hurtigere end kilden ved hastighed 60', () => {
    const kilde = testUr(0);
    const ur = komprimeretUr({ kilde, virtuelStart: T0, hastighed: 60 });

    expect(ur.naa()).toBe(T0);
    kilde.spol(sek(1));
    expect(ur.naa()).toBe(T0 + min(1));
    kilde.spol(sek(4));
    expect(ur.naa()).toBe(T0 + min(5));
  });

  test('opfoerer sig som kilden ved hastighed 1', () => {
    const kilde = testUr(0);
    const ur = komprimeretUr({ kilde, virtuelStart: T0, hastighed: 1 });
    kilde.spol(sek(37));
    expect(ur.naa()).toBe(T0 + sek(37));
  });

  test('afviser hastighed 0 eller derunder', () => {
    const kilde = testUr(0);
    expect(() => komprimeretUr({ kilde, virtuelStart: T0, hastighed: 0 })).toThrow(/hastighed/i);
    expect(() => komprimeretUr({ kilde, virtuelStart: T0, hastighed: -2 })).toThrow(/hastighed/i);
  });

  test('spoler hele natten igennem paa faa sekunder', () => {
    // Generalproeven: 5,5 times vagt afviklet paa 5,5 minut ved hastighed 60.
    const kilde = testUr(0);
    const ur = komprimeretUr({ kilde, virtuelStart: T0, hastighed: 60 });
    kilde.spol(min(5.5));
    expect(ur.naa()).toBe(T0 + min(330));
  });
});
