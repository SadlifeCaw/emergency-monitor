import { describe, expect, test } from 'vitest';
import { bygAlarmvisning, bygSkaermbillede } from '../src/drift/skaermbillede.js';
import { kvitter, nyTilstand, tick } from '../src/motor/motor.js';
import { T0, bygAlarm, bygAnomali, iso, medHaendelser, min, sek } from './hjaelp/byg.js';

const ALARM_KL = T0 + min(164);
const scenarie = medHaendelser(
  bygAnomali({ id: 'a1', at: iso(T0 + min(70)), autoOploesSek: 90 }),
  bygAlarm({ at: iso(ALARM_KL) }),
);
const rolig = nyTilstand(scenarie, T0);
const medAlarm = tick(scenarie, rolig, ALARM_KL).tilstand;

describe('bygAlarmvisning', () => {
  test('giver null naar der ikke er nogen aktiv alarm', () => {
    expect(bygAlarmvisning(scenarie, rolig, T0 + min(30))).toBeNull();
  });

  test('leverer alt et vagthold skal bruge for at komme afsted', () => {
    const v = bygAlarmvisning(scenarie, medAlarm, ALARM_KL);
    expect(v).not.toBeNull();
    expect(v?.titel).toBe('BEKRAEFTET AKTIVITET');
    expect(v?.instruks).toBe('UDRYK STRAKS - MELD VED ANKOMST');
    expect(v?.naermestePunkt).toBe('P15 TREKANTSDEPOT');
  });

  test('regner afstand og pejling fra basen', () => {
    const v = bygAlarmvisning(scenarie, medAlarm, ALARM_KL);
    expect(v?.afstandM).toBe(394);
    expect(v?.pejlingGrader).toBe(60);
  });

  test('udleder sektoren af pejlingen, saa kile og tal altid er enige', () => {
    // Pejling 60 grader med 8 sektorer -> sektor 2. Scenariefilen kan ikke
    // laengere paastaa noget andet; feltet findes ikke paa en ALARM.
    expect(bygAlarmvisning(scenarie, medAlarm, ALARM_KL)?.sektor).toBe(2);
  });

  test('viser koordinatet i grader og decimalminutter', () => {
    expect(bygAlarmvisning(scenarie, medAlarm, ALARM_KL)?.ddm).toBe("55°39.606'N 009°21.888'E");
  });

  test('deler koordinatet i to, saa cifrene kan blive store nok', () => {
    // Et koordinat paa én linje bliver for smalt at laese fra tre meters
    // afstand i moerke. To linjer er ogsaa maaden, det laeses op paa.
    const v = bygAlarmvisning(scenarie, medAlarm, ALARM_KL);
    expect(v?.ddmLat).toBe("55°39.606'N");
    expect(v?.ddmLon).toBe("009°21.888'E");
    expect(`${v?.ddmLat} ${v?.ddmLon}`).toBe(v?.ddm);
  });

  test('afstand og pejling er hele tal - de skal skrives af i moerke', () => {
    const v = bygAlarmvisning(scenarie, medAlarm, ALARM_KL);
    expect(Number.isInteger(v?.afstandM)).toBe(true);
    expect(Number.isInteger(v?.pejlingGrader)).toBe(true);
  });

  test('taeller sekunder siden alarmen faldt', () => {
    expect(bygAlarmvisning(scenarie, medAlarm, ALARM_KL)?.sekunderSiden).toBe(0);
    expect(bygAlarmvisning(scenarie, medAlarm, ALARM_KL + sek(95))?.sekunderSiden).toBe(95);
  });

  test('markerer kvittering', () => {
    expect(bygAlarmvisning(scenarie, medAlarm, ALARM_KL)?.kvitteret).toBe(false);
    const kvitteret = kvitter(medAlarm, ALARM_KL + sek(30)).tilstand;
    expect(bygAlarmvisning(scenarie, kvitteret, ALARM_KL + sek(40))?.kvitteret).toBe(true);
  });
});

describe('bygSkaermbillede', () => {
  const log = [{ kl: iso(T0), niveau: 'RUTINE' as const, tekst: 'SWEEP SEKTOR 1 ... INTET' }];
  const historik = { seismik: [0.05], emf: [0.09], temperatur: [11.9] };
  const visning = { log, historik };

  test('baerer fase, vagthold og serverens ur', () => {
    const s = bygSkaermbillede(scenarie, rolig, visning, T0 + min(30));
    expect(s.fase).toBe('ROLIG');
    expect(s.vagthold).toBe('A');
    expect(s.serverKl).toBe(iso(T0 + min(30)));
  });

  test('baerer basen og kortopsaetningen, saa skaermen kan tegne uden at spoerge igen', () => {
    const s = bygSkaermbillede(scenarie, rolig, visning, T0);
    expect(s.base.label).toBe('STATION VORK');
    expect(s.kort.sektorer).toBe(8);
    expect(s.kort.maxRadiusM).toBe(800);
  });

  test('baerer sensoraflaesningen', () => {
    const s = bygSkaermbillede(scenarie, rolig, visning, T0 + min(30));
    expect(s.sensorer.seismik).toBeGreaterThanOrEqual(0);
    expect(s.sensorer.temperatur).toBeLessThan(20);
  });

  test('baerer loggen som den er givet', () => {
    expect(bygSkaermbillede(scenarie, rolig, visning, T0).log).toEqual(log);
  });

  test('baerer dekrypteringen som stemning', () => {
    // Panelet er stemning og ikke en historie: procenten kommer fra uret,
    // ikke fra en haendelse nogen har planlagt.
    const s = bygSkaermbillede(scenarie, rolig, visning, T0);
    expect(s.dekryptering.procent).toBeGreaterThanOrEqual(0);
    expect(s.dekryptering.procent).toBeLessThanOrEqual(100);
    expect(s.dekryptering.fragment.length).toBeGreaterThan(0);
  });

  test('viser anomalier der genereres af sig selv gennem natten', () => {
    // Anomalierne staar ikke i scenariet laengere. De udledes af uret, saa
    // testen leder efter dem frem for at planlaegge dem.
    let fundet = 0;
    for (let m = 0; m < 300; m += 1) {
      const s = bygSkaermbillede(scenarie, rolig, visning, T0 + min(m));
      if (s.anomalier.length > 0) {
        expect(s.anomalier[0]?.sektor).toBeGreaterThanOrEqual(1);
        expect(s.anomalier[0]?.sektor).toBeLessThanOrEqual(8);
        expect(s.anomalier[0]?.tekst.length).toBeGreaterThan(0);
        fundet += 1;
      }
    }
    expect(fundet).toBeGreaterThan(0);
  });

  test('viser ingen anomalier mens en alarm koerer', () => {
    // Sirenen har ordet.
    for (let m = 0; m < 300; m += 1) {
      expect(bygSkaermbillede(scenarie, medAlarm, visning, T0 + min(m)).anomalier).toEqual([]);
    }
  });

  test('har alarmen med naar den er aktiv', () => {
    expect(bygSkaermbillede(scenarie, medAlarm, visning, ALARM_KL).alarm).not.toBeNull();
    expect(bygSkaermbillede(scenarie, rolig, visning, T0).alarm).toBeNull();
  });
});

describe('sensorhistorik', () => {
  const log = [{ kl: iso(T0), niveau: 'RUTINE' as const, tekst: 'SWEEP SEKTOR 1 ... INTET' }];
  const historik = {
    seismik: [0.05, 0.06, 0.71],
    emf: [0.09, 0.11, 0.63],
    temperatur: [11.9, 11.8, 10.4],
  };

  test('baeres uaendret videre til skaermen', () => {
    const s = bygSkaermbillede(scenarie, rolig, { log, historik }, T0);
    expect(s.historik).toEqual(historik);
  });

  test('graferne kan tegne optrapningen selv efter en genstart', () => {
    // Historikken kommer fra serveren og ikke fra klientens hukommelse. Ellers
    // ville en genstart kl. 02.10 give tomme grafer, praecis naar rampen op mod
    // alarmen skulle vaere synlig.
    const s = bygSkaermbillede(scenarie, rolig, { log, historik }, T0);
    expect(s.historik.seismik.at(-1)).toBe(0.71);
    expect(s.historik.seismik).toHaveLength(3);
  });

  test('en tom historik er gyldig - skaermen starter med tomme grafer', () => {
    const tom = { seismik: [], emf: [], temperatur: [] };
    expect(bygSkaermbillede(scenarie, rolig, { log, historik: tom }, T0).historik).toEqual(tom);
  });
});
