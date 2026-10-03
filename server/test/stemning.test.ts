import { describe, expect, test } from 'vitest';
import { anomaliNu, dekrypteringNu, erNat, timeIZone } from '../src/motor/stemning.js';

/** Alle tidspunkter skrives i dansk sommertid, som er den tid lejren lever i. */
const kl = (dag: number, time: string): number =>
  Date.parse(`2026-07-${String(dag).padStart(2, '0')}T${time}:00+02:00`);

const NAT = { fra: '23:00', til: '05:00' } as const;
const STEMNING = { anomalierPrNat: 4, natvindue: NAT } as const;
const SEED = 20260715;

describe('timeIZone', () => {
  test('regner i dansk tid, ikke i maskinens', () => {
    // 22:30 UTC er 00:30 dansk sommertid. Testen skal give det samme svar,
    // uanset hvilken tidszone den koeres i.
    expect(timeIZone(Date.parse('2026-07-15T22:30:00Z'))).toBeCloseTo(0.5, 3);
  });

  test('giver minutter som decimaler', () => {
    expect(timeIZone(kl(15, '23:45'))).toBeCloseTo(23.75, 3);
  });
});

describe('erNat', () => {
  test('er nat inde i vinduet', () => {
    expect(erNat(kl(15, '23:30'), NAT)).toBe(true);
    expect(erNat(kl(16, '02:00'), NAT)).toBe(true);
    expect(erNat(kl(16, '04:59'), NAT)).toBe(true);
  });

  test('er dag uden for vinduet', () => {
    expect(erNat(kl(16, '05:30'), NAT)).toBe(false);
    expect(erNat(kl(16, '14:00'), NAT)).toBe(false);
    expect(erNat(kl(16, '22:30'), NAT)).toBe(false);
  });

  test('haandterer at vinduet gaar over midnat', () => {
    expect(erNat(kl(15, '23:00'), NAT)).toBe(true);
    expect(erNat(kl(16, '00:00'), NAT)).toBe(true);
  });

  test('virker ogsaa med et vindue der ikke krydser midnat', () => {
    const eftermiddag = { fra: '13:00', til: '17:00' };
    expect(erNat(kl(16, '14:00'), eftermiddag)).toBe(true);
    expect(erNat(kl(16, '23:00'), eftermiddag)).toBe(false);
  });
});

describe('anomaliNu', () => {
  /** Gaar en hel nat igennem minut for minut og samler de anomalier der optraeder. */
  const nattensAnomalier = (dag: number, seed = SEED, alarmAktiv = false) => {
    const fundne: { start: number; sektor: number }[] = [];
    let sidste: string | null = null;

    for (let m = 0; m < 6 * 60; m += 1) {
      const nu = kl(dag, '23:00') + m * 60_000;
      const a = anomaliNu({ seed, ...STEMNING }, nu, alarmAktiv);
      const noegle = a ? `${a.id}` : null;
      if (noegle && noegle !== sidste) fundne.push({ start: m, sektor: a?.sektor ?? 0 });
      sidste = noegle;
    }
    return fundne;
  };

  test('kommer aldrig om dagen', () => {
    for (let m = 0; m < 18 * 60; m += 7) {
      const nu = kl(16, '05:00') + m * 60_000;
      expect(anomaliNu({ seed: SEED, ...STEMNING }, nu, false)).toBeNull();
    }
  });

  test('kommer et par gange i loebet af natten', () => {
    const antal = nattensAnomalier(15).length;
    expect(antal).toBeGreaterThan(1);
    expect(antal).toBeLessThan(10);
  });

  test('kommer aldrig mens en alarm koerer', () => {
    // Sirenen har ordet. Et gult udslag midt i en alarm ville kun forvirre.
    expect(nattensAnomalier(15, SEED, true)).toHaveLength(0);
  });

  test('er deterministisk - samme nat giver samme udslag', () => {
    expect(nattensAnomalier(15)).toEqual(nattensAnomalier(15));
  });

  test('to naetter ligner ikke hinanden', () => {
    expect(nattensAnomalier(15)).not.toEqual(nattensAnomalier(17));
  });

  test('staar aaben et stykke tid og forsvinder saa igen', () => {
    const nat = kl(15, '23:00');
    let aabneMinutter = 0;
    for (let m = 0; m < 6 * 60; m += 1) {
      if (anomaliNu({ seed: SEED, ...STEMNING }, nat + m * 60_000, false)) aabneMinutter += 1;
    }
    // Der skal vaere langt mere stille end uroligt.
    expect(aabneMinutter).toBeGreaterThan(0);
    expect(aabneMinutter).toBeLessThan(6 * 60 * 0.3);
  });

  test('holder sig inden for kortets sektorer', () => {
    for (const { sektor } of nattensAnomalier(15)) {
      expect(sektor).toBeGreaterThanOrEqual(1);
      expect(sektor).toBeLessThanOrEqual(8);
    }
  });

  test('flere anomalier pr. nat giver flere udslag', () => {
    const faa = { seed: SEED, natvindue: NAT, anomalierPrNat: 2 };
    const mange = { seed: SEED, natvindue: NAT, anomalierPrNat: 12 };
    const tael = (o: typeof faa) => {
      let n = 0;
      let sidste: string | null = null;
      for (let m = 0; m < 6 * 60; m += 1) {
        const a = anomaliNu(o, kl(15, '23:00') + m * 60_000, false);
        if (a && a.id !== sidste) n += 1;
        sidste = a?.id ?? null;
      }
      return n;
    };
    expect(tael(mange)).toBeGreaterThan(tael(faa));
  });
});

describe('dekrypteringNu', () => {
  const opsaetning = { seed: SEED, ...STEMNING };

  test('giver altid en procent mellem 0 og 100', () => {
    for (let m = 0; m < 24 * 60; m += 3) {
      const p = dekrypteringNu(opsaetning, kl(15, '00:00') + m * 60_000).procent;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  test('er deterministisk', () => {
    const nu = kl(16, '01:23');
    expect(dekrypteringNu(opsaetning, nu)).toEqual(dekrypteringNu(opsaetning, nu));
  });

  test('bevaeger sig langsomt - ikke et nyt tal hvert sekund', () => {
    const nu = kl(16, '01:00');
    const om10sek = dekrypteringNu(opsaetning, nu + 10_000).procent;
    expect(Math.abs(dekrypteringNu(opsaetning, nu).procent - om10sek)).toBeLessThan(2);
  });

  test('aendrer sig maerkbart over en halv time', () => {
    const nu = kl(16, '01:00');
    const senere = dekrypteringNu(opsaetning, nu + 30 * 60_000).procent;
    expect(Math.abs(dekrypteringNu(opsaetning, nu).procent - senere)).toBeGreaterThan(1);
  });

  test('viser et fragment', () => {
    expect(dekrypteringNu(opsaetning, kl(16, '01:00')).fragment).toBeTruthy();
  });

  test('skifter fragment i loebet af natten', () => {
    const set = new Set<string>();
    for (let m = 0; m < 6 * 60; m += 5) {
      set.add(dekrypteringNu(opsaetning, kl(15, '23:00') + m * 60_000).fragment);
    }
    expect(set.size).toBeGreaterThan(2);
  });
});

describe('overstregning i fragmentet', () => {
  const opsaetning = { seed: SEED, ...STEMNING };

  test('overstreger inde i teksten, ikke efter den', () => {
    // Det gamle format satte blokke bagefter: "...tekst ...█████«". Det gav
    // ingen mening, naar procenten bare vipper. Nu ligger bjaelken i saetningen,
    // som paa et arkivdokument.
    const f = dekrypteringNu(opsaetning, kl(16, '01:00')).fragment;
    expect(f).toMatch(/█/);
    expect(f.endsWith('█')).toBe(false);
  });

  test('overstreger hele ord, ikke halve', () => {
    for (let m = 0; m < 6 * 60; m += 7) {
      const f = dekrypteringNu(opsaetning, kl(15, '23:00') + m * 60_000).fragment;
      for (const ord of f.split(' ')) {
        if (!ord.includes('█')) continue;
        expect(ord).toMatch(/^█+$/);
      }
    }
  });

  test('overstreger ikke smaaord', () => {
    for (let m = 0; m < 6 * 60; m += 7) {
      const f = dekrypteringNu(opsaetning, kl(15, '23:00') + m * 60_000).fragment;
      for (const ord of f.split(' ')) {
        if (ord.startsWith('█')) expect(ord.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test('lader det meste af saetningen staa', () => {
    const f = dekrypteringNu(opsaetning, kl(16, '01:00')).fragment;
    const skjult = (f.match(/█/g) ?? []).length;
    expect(skjult / f.length).toBeLessThan(0.4);
  });

  test('staar stille saa laenge fragmentet vises', () => {
    // Bjaelken maa ikke flytte sig fra sekund til sekund - saa ville teksten
    // blinke, og man ville tro der skete noget.
    const nu = kl(16, '01:00');
    expect(dekrypteringNu(opsaetning, nu).fragment).toBe(
      dekrypteringNu(opsaetning, nu + 30_000).fragment,
    );
  });
});
