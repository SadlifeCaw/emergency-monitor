import { describe, expect, test } from 'vitest';
import { aflaes, genererLoglinje, LOG_INTERVAL_SEK, paavirkning } from '../src/motor/telemetri.js';
import { nyTilstand, tick } from '../src/motor/motor.js';
import { T0, bygAlarm, bygAnomali, iso, medHaendelser, min, sek } from './hjaelp/byg.js';

const ALARM_KL = T0 + min(164);
const scenarie = medHaendelser(
  bygAnomali({ id: 'a1', at: iso(T0 + min(70)), autoOploesSek: 90 }),
  bygAlarm({ at: iso(ALARM_KL), optrapningSek: 300 }),
);

const roligTilstand = nyTilstand(scenarie, T0);
const tilstandVed = (nu: number) => tick(scenarie, roligTilstand, nu).tilstand;

describe('paavirkning', () => {
  test('er nul i den rolige del af natten', () => {
    expect(paavirkning(scenarie, roligTilstand, T0 + min(20))).toBe(0);
  });

  test('er nul praecis hvor optrapningsvinduet begynder', () => {
    expect(paavirkning(scenarie, roligTilstand, ALARM_KL - sek(300))).toBeCloseTo(0, 3);
  });

  test('er ca. en halv midt i optrapningen', () => {
    expect(paavirkning(scenarie, roligTilstand, ALARM_KL - sek(150))).toBeCloseTo(0.5, 2);
  });

  test('naar 1 naar alarmen falder', () => {
    expect(paavirkning(scenarie, roligTilstand, ALARM_KL)).toBeCloseTo(1, 3);
  });

  test('bliver paa 1 mens alarmen er aktiv', () => {
    const t = tilstandVed(ALARM_KL);
    expect(paavirkning(scenarie, t, ALARM_KL + min(20))).toBe(1);
  });

  test('stiger monotont gennem optrapningen', () => {
    let forrige = -1;
    for (let s = 300; s >= 0; s -= 10) {
      const v = paavirkning(scenarie, roligTilstand, ALARM_KL - sek(s));
      expect(v).toBeGreaterThanOrEqual(forrige);
      forrige = v;
    }
  });

  test('en anomali giver et maerkbart men mindre udslag end en alarm', () => {
    // Anomalierne kommer fra uret, saa testen leder efter et tidspunkt hvor
    // der er en - frem for at planlaegge den.
    const udslag: number[] = [];
    for (let m = 0; m < 150; m += 1) {
      const v = paavirkning(scenarie, roligTilstand, T0 + min(m));
      if (v > 0) udslag.push(v);
    }
    expect(udslag.length).toBeGreaterThan(0);
    for (const v of udslag) expect(v).toBeLessThan(0.6);
  });
});

describe('aflaes', () => {
  test('er deterministisk - samme input giver samme udslag', () => {
    expect(aflaes(scenarie, roligTilstand, T0 + min(33))).toEqual(
      aflaes(scenarie, roligTilstand, T0 + min(33)),
    );
  });

  test('holder seismik og emf inden for 0-1 hele natten igennem', () => {
    for (let m = 0; m <= 330; m += 1) {
      const nu = T0 + min(m);
      const a = aflaes(scenarie, tilstandVed(nu), nu);
      expect(a.seismik).toBeGreaterThanOrEqual(0);
      expect(a.seismik).toBeLessThanOrEqual(1);
      expect(a.emf).toBeGreaterThanOrEqual(0);
      expect(a.emf).toBeLessThanOrEqual(1);
    }
  });

  test('ligger lavt og roligt i den stille del af natten', () => {
    for (let m = 5; m < 60; m += 1) {
      expect(aflaes(scenarie, roligTilstand, T0 + min(m)).seismik).toBeLessThan(0.25);
    }
  });

  test('slaar tydeligt ud naar alarmen falder', () => {
    const rolig = aflaes(scenarie, roligTilstand, T0 + min(30)).seismik;
    const alarm = aflaes(scenarie, tilstandVed(ALARM_KL), ALARM_KL).seismik;
    expect(alarm).toBeGreaterThan(rolig + 0.5);
  });

  test('er tydeligt uroligt allerede foer alarmen - opmaerksomhed skal kunne betale sig', () => {
    const rolig = aflaes(scenarie, roligTilstand, T0 + min(30)).seismik;
    const optrapning = aflaes(scenarie, roligTilstand, ALARM_KL - sek(60)).seismik;
    expect(optrapning).toBeGreaterThan(rolig + 0.2);
  });

  test('temperaturen er koldest midt paa natten og varmest om eftermiddagen', () => {
    const eftermiddag = aflaes(scenarie, roligTilstand, new Date(2026, 6, 15, 14).getTime());
    const nat = aflaes(scenarie, roligTilstand, new Date(2026, 6, 16, 2).getTime());
    expect(nat.temperatur).toBeLessThan(eftermiddag.temperatur - 2);
  });

  test('temperaturen holder sig i et troværdigt julinat-interval', () => {
    for (let m = 0; m <= 330; m += 3) {
      const t = aflaes(scenarie, roligTilstand, T0 + min(m)).temperatur;
      expect(t).toBeGreaterThan(2);
      expect(t).toBeLessThan(20);
    }
  });

  test('afrunder til det antal decimaler skaermen viser', () => {
    const a = aflaes(scenarie, roligTilstand, T0 + min(44));
    expect(a.temperatur).toBe(Number(a.temperatur.toFixed(1)));
    expect(a.seismik).toBe(Number(a.seismik.toFixed(3)));
  });
});

describe('genererLoglinje', () => {
  const paaInterval = T0 - (T0 % sek(LOG_INTERVAL_SEK)) + sek(LOG_INTERVAL_SEK) * 20;

  test('giver kun en linje paa logintervallet', () => {
    expect(genererLoglinje(scenarie, roligTilstand, paaInterval)).not.toBeNull();
    expect(genererLoglinje(scenarie, roligTilstand, paaInterval + sek(1))).toBeNull();
  });

  test('er deterministisk', () => {
    expect(genererLoglinje(scenarie, roligTilstand, paaInterval)).toEqual(
      genererLoglinje(scenarie, roligTilstand, paaInterval),
    );
  });

  test('er RUTINE i den rolige fase', () => {
    expect(genererLoglinje(scenarie, roligTilstand, paaInterval)?.niveau).toBe('RUTINE');
  });

  test('er ALARM naar alarmen er aktiv', () => {
    const t = tilstandVed(ALARM_KL);
    const nu = ALARM_KL - (ALARM_KL % sek(LOG_INTERVAL_SEK)) + sek(LOG_INTERVAL_SEK);
    expect(genererLoglinje(scenarie, t, nu)?.niveau).toBe('ALARM');
  });

  test('varierer teksten over tid i stedet for at gentage sig selv', () => {
    const tekster = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const linje = genererLoglinje(scenarie, roligTilstand, paaInterval + sek(LOG_INTERVAL_SEK * i));
      if (linje) tekster.add(linje.tekst);
    }
    expect(tekster.size).toBeGreaterThan(5);
  });

  test('saetter klokkeslaettet fra det angivne tidspunkt', () => {
    expect(genererLoglinje(scenarie, roligTilstand, paaInterval)?.kl).toBe(iso(paaInterval));
  });
});

describe('loggens sektornumre', () => {
  const paaInterval = (nu: number) => nu - (nu % sek(LOG_INTERVAL_SEK));

  test('naevner alarmens egen sektor under alarm', () => {
    // Alarmpunktet ligger i pejling 60 grader = sektor 2. Loggen maa ikke
    // sige noget andet end udrykningsfeltet.
    const t = tilstandVed(ALARM_KL);
    const linje = genererLoglinje(scenarie, t, paaInterval(ALARM_KL + sek(24)));
    expect(linje?.niveau).toBe('ALARM');
    if (linje?.tekst.includes('SEKTOR')) {
      expect(linje.tekst).toContain('SEKTOR 2');
    }
  });

  test('naevner aldrig en anden sektor end alarmens, uanset tidspunkt', () => {
    const t = tilstandVed(ALARM_KL);
    for (let i = 0; i < 60; i += 1) {
      const nu = paaInterval(ALARM_KL + sek(LOG_INTERVAL_SEK * i));
      const linje = genererLoglinje(scenarie, t, nu);
      if (linje?.tekst.includes('SEKTOR')) {
        expect(linje.tekst).toMatch(/SEKTOR 2\b/);
      }
    }
  });

  test('naevner anomaliens sektor, mens den staar aaben', () => {
    // anomali a1 ligger i sektor 3.
    const t = tilstandVed(T0 + min(70));
    for (let i = 0; i < 6; i += 1) {
      const nu = paaInterval(T0 + min(70) + sek(LOG_INTERVAL_SEK * i));
      const linje = genererLoglinje(scenarie, t, nu);
      if (linje?.niveau === 'ADVARSEL' && linje.tekst.includes('SEKTOR')) {
        expect(linje.tekst).toMatch(/SEKTOR 3\b/);
      }
    }
  });

  test('vandrer frit gennem sektorerne i rutinedrift', () => {
    const set = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const linje = genererLoglinje(
        scenarie,
        roligTilstand,
        paaInterval(T0 + sek(LOG_INTERVAL_SEK * i)),
      );
      const fund = linje?.tekst.match(/SEKTOR (\d)/);
      if (fund?.[1]) set.add(fund[1]);
    }
    expect(set.size).toBeGreaterThan(2);
  });
});
