import { describe, expect, test } from 'vitest';
import { ScenarieFejl, laesScenarie } from '../src/motor/scenarie.js';
import { T0, bygAlarm, bygAnomali, bygScenarie, iso, min } from './hjaelp/byg.js';

const raa = (overskriv: Record<string, unknown> = {}): unknown => ({
  ...bygScenarie(),
  ...overskriv,
});

describe('laesScenarie', () => {
  test('godtager et gyldigt scenarie', () => {
    const s = laesScenarie(raa({ haendelser: [bygAnomali(), bygAlarm()] }));
    expect(s.navn).toBe('Testnat');
    expect(s.haendelser).toHaveLength(2);
  });

  test('sorterer haendelser kronologisk uanset raekkefoelgen i filen', () => {
    const sent = bygAnomali({ id: 'sent', at: iso(T0 + min(120)) });
    const tidligt = bygAnomali({ id: 'tidligt', at: iso(T0 + min(10)) });
    const s = laesScenarie(raa({ haendelser: [sent, tidligt] }));
    expect(s.haendelser.map((h) => h.id)).toEqual(['tidligt', 'sent']);
  });

  test('afviser to haendelser med samme id og naevner id-et', () => {
    const a = bygAnomali({ id: 'dublet' });
    const b = bygAnomali({ id: 'dublet', at: iso(T0 + min(70)) });
    expect(() => laesScenarie(raa({ haendelser: [a, b] }))).toThrow(ScenarieFejl);
    expect(() => laesScenarie(raa({ haendelser: [a, b] }))).toThrow(/dublet/);
  });

  test('afviser et alarmpunkt uden for maxRadiusM og naevner afstanden', () => {
    // Vejle Fjord i stedet for Vork Bakker.
    const langtVaek = bygAlarm({ lat: 55.7, lon: 9.45 });
    expect(() => laesScenarie(raa({ haendelser: [langtVaek] }))).toThrow(ScenarieFejl);
    expect(() => laesScenarie(raa({ haendelser: [langtVaek] }))).toThrow(/800 m/);
  });

  test('godtager et alarmpunkt inden for maxRadiusM', () => {
    expect(() => laesScenarie(raa({ haendelser: [bygAlarm()] }))).not.toThrow();
  });

  test('afviser et ugyldigt tidsstempel', () => {
    const daarlig = { ...bygAnomali(), at: 'i morgen ved midnat' };
    expect(() => laesScenarie(raa({ haendelser: [daarlig] }))).toThrow(/at/);
  });

  test('afviser en ukendt haendelsestype', () => {
    const daarlig = { ...bygAnomali(), type: 'SPOEGELSE' };
    expect(() => laesScenarie(raa({ haendelser: [daarlig] }))).toThrow(ScenarieFejl);
  });

  test('afviser en sektor uden for kortets sektorinddeling', () => {
    expect(() => laesScenarie(raa({ haendelser: [bygAnomali({ sektor: 12 })] }))).toThrow(
      /sektor/i,
    );
    expect(() => laesScenarie(raa({ haendelser: [bygAnomali({ sektor: 0 })] }))).toThrow(/sektor/i);
  });

  test('afviser negativ autoOploesSek', () => {
    expect(() => laesScenarie(raa({ haendelser: [bygAnomali({ autoOploesSek: -5 })] }))).toThrow(
      ScenarieFejl,
    );
  });

  test('afviser en dekrypteringsprocent uden for 0-100', () => {
    const daarlig = { ...bygAnomali(), type: 'DEKRYPTERING', procent: 140, fragment: 'x' };
    expect(() => laesScenarie(raa({ haendelser: [daarlig] }))).toThrow(ScenarieFejl);
  });

  test('giver en laesbar fejl - ikke et raat zod-dump', () => {
    let besked = '';
    try {
      laesScenarie({ version: 1 });
    } catch (fejl) {
      besked = (fejl as Error).message;
    }
    expect(besked).toMatch(/scenarie/i);
    expect(besked.length).toBeLessThan(600);
  });

  test('afviser en anden version end 1', () => {
    expect(() => laesScenarie(raa({ version: 2 }))).toThrow(ScenarieFejl);
  });
});
