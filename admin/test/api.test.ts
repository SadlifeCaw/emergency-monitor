import { describe, expect, test } from 'vitest';
import { tolkSvar } from '../src/api.js';

describe('tolkSvar', () => {
  test('giver data videre ved 200', () => {
    expect(tolkSvar(200, { fase: 'ROLIG' })).toEqual({ ok: true, data: { fase: 'ROLIG' } });
  });

  test('viser serverens egen besked ved 400', () => {
    // Serverens fejlbeskeder er skrevet til et menneske. De skal staa ordret
    // paa telefonen, ikke oversaettes til "noget gik galt".
    const svar = tolkSvar(400, { fejl: 'Alarmen ligger 8123 m fra basen, men graensen er 800 m' });
    expect(svar).toEqual({
      ok: false,
      fejl: 'Alarmen ligger 8123 m fra basen, men graensen er 800 m',
    });
  });

  test('forklarer et forkert token i stedet for at vise 401', () => {
    expect(tolkSvar(401, { fejl: 'Forkert eller manglende adgangstoken.' })).toEqual({
      ok: false,
      fejl: 'Forkert eller manglende adgangstoken.',
      ugyldigtToken: true,
    });
  });

  test('forklarer rate limit i klar tekst', () => {
    const svar = tolkSvar(429, { fejl: 'For mange forespoergsler. Vent et oejeblik.' });
    expect(svar.ok).toBe(false);
    expect('fejl' in svar && svar.fejl).toMatch(/vent/i);
  });

  test('falder tilbage paa en laesbar tekst, naar serveren ikke sendte nogen', () => {
    const svar = tolkSvar(500, {});
    expect(svar.ok).toBe(false);
    expect('fejl' in svar && svar.fejl).toMatch(/serveren/i);
  });

  test('haandterer et svar der slet ikke er JSON', () => {
    const svar = tolkSvar(502, null);
    expect(svar.ok).toBe(false);
    expect('fejl' in svar && svar.fejl).toBeTruthy();
  });
});
