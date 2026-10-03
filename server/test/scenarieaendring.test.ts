import { describe, expect, test } from 'vitest';
import { fjernHaendelse, retHaendelse, tilfoejHaendelse } from '../src/motor/scenarieaendring.js';
import { ScenarieFejl, laesScenarie } from '../src/motor/scenarie.js';
import { T0, bygAlarm, bygAnomali, bygScenarie, iso, min } from './hjaelp/byg.js';

const scenarie = laesScenarie(
  bygScenarie({ haendelser: [bygAnomali({ id: 'a1' }), bygAlarm({ id: 'alarm-hoved' })] }),
);

describe('tilfoejHaendelse', () => {
  test('tilfoejer en ny haendelse', () => {
    const ny = bygAnomali({ id: 'a2', at: iso(T0 + min(90)) });
    const efter = tilfoejHaendelse(scenarie, ny);
    expect(efter.haendelser.map((h) => h.id)).toContain('a2');
    expect(efter.haendelser).toHaveLength(3);
  });

  test('holder haendelserne kronologisk sorteret', () => {
    const tidlig = bygAnomali({ id: 'tidlig', at: iso(T0 + min(5)) });
    const efter = tilfoejHaendelse(scenarie, tidlig);
    expect(efter.haendelser[0]?.id).toBe('tidlig');
  });

  test('muterer ikke det oprindelige scenarie', () => {
    const foer = scenarie.haendelser.length;
    tilfoejHaendelse(scenarie, bygAnomali({ id: 'a3', at: iso(T0 + min(95)) }));
    expect(scenarie.haendelser).toHaveLength(foer);
  });

  test('afviser et id der allerede findes', () => {
    expect(() => tilfoejHaendelse(scenarie, bygAnomali({ id: 'a1' }))).toThrow(/a1/);
  });

  test('afviser en alarm uden for den rekognoscerede radius', () => {
    // Den vigtigste enkelte spaerring i hele admin-fladen.
    const langtVaek = bygAlarm({ id: 'fjern', lat: 55.7, lon: 9.45 });
    expect(() => tilfoejHaendelse(scenarie, langtVaek)).toThrow(ScenarieFejl);
    expect(() => tilfoejHaendelse(scenarie, langtVaek)).toThrow(/800 m/);
  });

  test('afviser en haendelse uden for vagtvinduet', () => {
    expect(() =>
      tilfoejHaendelse(scenarie, bygAnomali({ id: 'sent', at: iso(T0 + min(400)) })),
    ).toThrow(/perioden/i);
  });

  test('afviser en sektor kortet ikke har', () => {
    expect(() =>
      tilfoejHaendelse(scenarie, bygAnomali({ id: 'a9', sektor: 12, at: iso(T0 + min(80)) })),
    ).toThrow(/sektor/i);
  });

  test('afviser noget der slet ikke er en haendelse', () => {
    expect(() => tilfoejHaendelse(scenarie, { hej: 'med dig' })).toThrow(ScenarieFejl);
  });
});

describe('retHaendelse', () => {
  test('flytter et tidspunkt', () => {
    const efter = retHaendelse(scenarie, 'alarm-hoved', { at: iso(T0 + min(200)) });
    const alarm = efter.haendelser.find((h) => h.id === 'alarm-hoved');
    expect(alarm?.at).toBe(iso(T0 + min(200)));
  });

  test('flytter et alarmkoordinat', () => {
    const efter = retHaendelse(scenarie, 'alarm-hoved', { lat: 55.6595, lon: 9.3635 });
    const alarm = efter.haendelser.find((h) => h.id === 'alarm-hoved');
    expect(alarm).toMatchObject({ lat: 55.6595, lon: 9.3635 });
  });

  test('lader felter man ikke roerer staa uroert', () => {
    const efter = retHaendelse(scenarie, 'alarm-hoved', { at: iso(T0 + min(170)) });
    const alarm = efter.haendelser.find((h) => h.id === 'alarm-hoved');
    expect(alarm).toMatchObject({ naermestePunkt: 'P15 TREKANTSDEPOT', usikkerhedM: 40 });
  });

  test('sorterer om, naar et tidspunkt flyttes forbi et andet', () => {
    const efter = retHaendelse(scenarie, 'alarm-hoved', { at: iso(T0 + min(10)) });
    expect(efter.haendelser[0]?.id).toBe('alarm-hoved');
  });

  test('afviser at flytte alarmen uden for radius', () => {
    expect(() => retHaendelse(scenarie, 'alarm-hoved', { lat: 55.72, lon: 9.47 })).toThrow(
      /m fra basen/,
    );
  });

  test('afviser at flytte en haendelse uden for vagtvinduet', () => {
    expect(() => retHaendelse(scenarie, 'a1', { at: iso(T0 + min(500)) })).toThrow(/perioden/i);
  });

  test('afviser et ukendt id', () => {
    expect(() => retHaendelse(scenarie, 'findes-ikke', { at: iso(T0) })).toThrow(/findes-ikke/);
  });

  test('afviser et felt der ikke hoerer til haendelsestypen', () => {
    // En anomali har ingen koordinater. Uden den her ville et taste-slip
    // blive tavst ignoreret i stedet for afvist.
    expect(() => retHaendelse(scenarie, 'a1', { lat: 55.66 })).toThrow(ScenarieFejl);
  });

  test('afviser at aendre id', () => {
    expect(() => retHaendelse(scenarie, 'a1', { id: 'noget-andet' })).toThrow(/id/i);
  });

  test('afviser at aendre type', () => {
    expect(() => retHaendelse(scenarie, 'a1', { type: 'ALARM' })).toThrow(/type/i);
  });

  test('muterer ikke det oprindelige scenarie', () => {
    const foer = scenarie.haendelser.find((h) => h.id === 'alarm-hoved')?.at;
    retHaendelse(scenarie, 'alarm-hoved', { at: iso(T0 + min(200)) });
    expect(scenarie.haendelser.find((h) => h.id === 'alarm-hoved')?.at).toBe(foer);
  });
});

describe('fjernHaendelse', () => {
  test('fjerner haendelsen', () => {
    const efter = fjernHaendelse(scenarie, 'a1');
    expect(efter.haendelser.map((h) => h.id)).not.toContain('a1');
    expect(efter.haendelser).toHaveLength(1);
  });

  test('afviser et ukendt id', () => {
    expect(() => fjernHaendelse(scenarie, 'findes-ikke')).toThrow(/findes-ikke/);
  });

  test('muterer ikke det oprindelige scenarie', () => {
    fjernHaendelse(scenarie, 'a1');
    expect(scenarie.haendelser).toHaveLength(2);
  });
});
