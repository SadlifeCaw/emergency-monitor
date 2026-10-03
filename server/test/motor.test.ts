import { describe, expect, test } from 'vitest';
import { fyrNu, kvitter, nyTilstand, stop, tick } from '../src/motor/motor.js';
import type { Tickresultat, UdgaaendeBegivenhed } from '../src/motor/typer.js';
import {
  T0,
  bygAfslut,
  bygAlarm,
  bygAnomali,
  bygDekryptering,
  bygMelding,
  iso,
  medHaendelser,
  min,
  sek,
} from './hjaelp/byg.js';

const fyrede = (r: Tickresultat): string[] =>
  r.udgaaende.filter((u) => u.slags === 'HAENDELSE_FYRET').map((u) => u.haendelse.id);

const slags = (u: readonly UdgaaendeBegivenhed[], s: UdgaaendeBegivenhed['slags']) =>
  u.filter((x) => x.slags === s);

describe('nyTilstand', () => {
  test('starter i fasen ROLIG uden fyrede haendelser', () => {
    const t = nyTilstand(medHaendelser(bygAlarm()), T0);
    expect(t.fase).toBe('ROLIG');
    expect(t.fyrede).toEqual({});
    expect(t.aktivAlarm).toBeNull();
    expect(t.dekrypteringProcent).toBe(0);
  });
});

describe('tick - planlagte haendelser', () => {
  const scenarie = medHaendelser(bygAnomali());

  test('fyrer ikke foer det planlagte tidspunkt', () => {
    const r = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(59));
    expect(fyrede(r)).toEqual([]);
    expect(r.tilstand.fyrede).toEqual({});
  });

  test('fyrer paa det planlagte tidspunkt', () => {
    const r = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(60));
    expect(fyrede(r)).toEqual(['anomali-1']);
    expect(r.tilstand.fyrede['anomali-1']?.fyretKl).toBe(iso(T0 + min(60)));
  });

  test('fyrer ikke den samme haendelse to gange', () => {
    const foerste = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(60));
    const anden = tick(scenarie, foerste.tilstand, T0 + min(61));
    expect(fyrede(anden)).toEqual([]);
    expect(anden.tilstand.fyrede['anomali-1']?.fyretKl).toBe(iso(T0 + min(60)));
  });

  test('fyrer flere forfaldne haendelser i kronologisk raekkefoelge', () => {
    const s = medHaendelser(
      bygAlarm({ at: iso(T0 + min(90)) }),
      bygMelding({ id: 'm1', at: iso(T0 + min(20)) }),
      bygAnomali({ id: 'a1', at: iso(T0 + min(50)) }),
    );
    const r = tick(s, nyTilstand(s, T0), T0 + min(120));
    expect(fyrede(r)).toEqual(['m1', 'a1', 'alarm-hoved']);
  });

  test('muterer ikke den indkomne tilstand', () => {
    const foer = nyTilstand(scenarie, T0);
    const frossen = structuredClone(foer);
    tick(scenarie, foer, T0 + min(60));
    expect(foer).toEqual(frossen);
  });
});

describe('tick - anomalier opløses selv', () => {
  const scenarie = medHaendelser(bygAnomali({ autoOploesSek: 90 }));

  const efterFyring = () => tick(scenarie, nyTilstand(scenarie, T0), T0 + min(60)).tilstand;

  test('staar aaben lige efter fyring', () => {
    expect(efterFyring().fyrede['anomali-1']?.oploestKl).toBeNull();
  });

  test('er stadig aaben et sekund foer fristen', () => {
    const r = tick(scenarie, efterFyring(), T0 + min(60) + sek(89));
    expect(r.tilstand.fyrede['anomali-1']?.oploestKl).toBeNull();
    expect(slags(r.udgaaende, 'ANOMALI_OPLOEST')).toHaveLength(0);
  });

  test('opløses naar fristen er naaet', () => {
    const r = tick(scenarie, efterFyring(), T0 + min(60) + sek(90));
    expect(r.tilstand.fyrede['anomali-1']?.oploestKl).toBe(iso(T0 + min(60) + sek(90)));
    expect(slags(r.udgaaende, 'ANOMALI_OPLOEST')).toHaveLength(1);
  });

  test('opløses kun én gang', () => {
    const oploest = tick(scenarie, efterFyring(), T0 + min(60) + sek(90)).tilstand;
    const igen = tick(scenarie, oploest, T0 + min(60) + sek(120));
    expect(slags(igen.udgaaende, 'ANOMALI_OPLOEST')).toHaveLength(0);
  });

  test('en alarm opløses ikke af anomali-fristen, men først efter 5 minutter', () => {
    const s = medHaendelser(bygAlarm({ at: iso(T0 + min(10)) }));
    let t = tick(s, nyTilstand(s, T0), T0 + min(10)).tilstand;
    t = tick(s, t, T0 + min(14)).tilstand;
    expect(t.fase).toBe('ALARM');
    expect(t.aktivAlarm?.haendelseId).toBe('alarm-hoved');
  });
});

describe('faser', () => {
  const alarm = bygAlarm({ at: iso(T0 + min(164)), optrapningSek: 300 });
  const scenarie = medHaendelser(alarm);

  test('er ROLIG langt foer alarmen', () => {
    expect(tick(scenarie, nyTilstand(scenarie, T0), T0 + min(100)).tilstand.fase).toBe('ROLIG');
  });

  test('er stadig ROLIG et sekund foer optrapningsvinduet', () => {
    const r = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(159) - sek(1));
    expect(r.tilstand.fase).toBe('ROLIG');
  });

  test('skifter til OPTRAPNING optrapningSek foer alarmen', () => {
    const r = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(159));
    expect(r.tilstand.fase).toBe('OPTRAPNING');
    expect(slags(r.udgaaende, 'FASE_SKIFT')).toHaveLength(1);
  });

  test('skifter til ALARM naar alarmen fyrer', () => {
    const optrapning = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(160)).tilstand;
    const r = tick(scenarie, optrapning, T0 + min(164));
    expect(r.tilstand.fase).toBe('ALARM');
    expect(r.tilstand.aktivAlarm).toEqual({
      haendelseId: 'alarm-hoved',
      fyretKl: iso(T0 + min(164)),
      kvitteretKl: null,
    });
  });

  test('udsender kun FASE_SKIFT ved faktisk skift', () => {
    const a = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(159));
    const b = tick(scenarie, a.tilstand, T0 + min(160));
    expect(slags(b.udgaaende, 'FASE_SKIFT')).toHaveLength(0);
  });

  test('skifter til AFSLUTTET naar AFSLUT-haendelsen fyrer', () => {
    const s = medHaendelser(bygAfslut({ at: iso(T0 + min(300)) }));
    const r = tick(s, nyTilstand(s, T0), T0 + min(300));
    expect(r.tilstand.fase).toBe('AFSLUTTET');
  });

  test('AFSLUTTET overtrumfer en senere optrapning', () => {
    const s = medHaendelser(
      bygAfslut({ at: iso(T0 + min(100)) }),
      bygAlarm({ at: iso(T0 + min(164)) }),
    );
    const r = tick(s, nyTilstand(s, T0), T0 + min(160));
    expect(r.tilstand.fase).toBe('AFSLUTTET');
  });
});

describe('alarmen slukker selv efter 5 minutter', () => {
  const scenarie = medHaendelser(bygAlarm({ at: iso(T0 + min(10)) }));
  const medAlarm = () => tick(scenarie, nyTilstand(scenarie, T0), T0 + min(10)).tilstand;

  test('staar stadig lige foer de 5 minutter er gaaet', () => {
    const t = tick(scenarie, medAlarm(), T0 + min(14.9)).tilstand;
    expect(t.fase).toBe('ALARM');
  });

  test('stopper efter 5 minutter og gaar tilbage til ROLIG', () => {
    const r = tick(scenarie, medAlarm(), T0 + min(15));
    expect(r.tilstand.aktivAlarm).toBeNull();
    expect(r.tilstand.fase).toBe('ROLIG');
    expect(slags(r.udgaaende, 'ALARM_STOPPET')).toHaveLength(1);
  });

  test('en kvitteret alarm slukker ogsaa efter 5 minutter fra fyring', () => {
    const kvitteret = kvitter(medAlarm(), T0 + min(12)).tilstand;
    expect(tick(scenarie, kvitteret, T0 + min(15)).tilstand.aktivAlarm).toBeNull();
  });
});

describe('alarmen bliver staaende', () => {
  const scenarie = medHaendelser(bygAlarm({ at: iso(T0 + min(10)) }));
  const medAlarm = () => tick(scenarie, nyTilstand(scenarie, T0), T0 + min(10)).tilstand;

  test('forbliver aktiv, til den slukker selv efter 5 minutter', () => {
    const t = tick(scenarie, medAlarm(), T0 + min(14)).tilstand;
    expect(t.fase).toBe('ALARM');
    expect(t.aktivAlarm?.kvitteretKl).toBeNull();
  });

  test('kvittering tier sirenen men lader punktet blive', () => {
    const r = kvitter(medAlarm(), T0 + min(12));
    expect(r.tilstand.fase).toBe('ALARM');
    expect(r.tilstand.aktivAlarm?.kvitteretKl).toBe(iso(T0 + min(12)));
    expect(slags(r.udgaaende, 'ALARM_KVITTERET')).toHaveLength(1);
  });

  test('kvittering uden aktiv alarm er en stille ikke-handling', () => {
    const r = kvitter(nyTilstand(scenarie, T0), T0 + min(1));
    expect(r.udgaaende).toEqual([]);
    expect(r.tilstand.aktivAlarm).toBeNull();
  });

  test('en kvitteret alarm bliver ikke ukvitteret ved naeste tick', () => {
    const kvitteret = kvitter(medAlarm(), T0 + min(12)).tilstand;
    const t = tick(scenarie, kvitteret, T0 + min(13)).tilstand;
    expect(t.aktivAlarm?.kvitteretKl).toBe(iso(T0 + min(12)));
  });
});

describe('stop - panikstoppet', () => {
  const scenarie = medHaendelser(bygAlarm({ at: iso(T0 + min(10)) }), bygAnomali({
    id: 'a1',
    at: iso(T0 + min(5)),
    autoOploesSek: 9999,
  }));

  const efterAlarm = () => tick(scenarie, nyTilstand(scenarie, T0), T0 + min(10)).tilstand;

  test('rydder den aktive alarm og gaar tilbage til ROLIG', () => {
    const r = stop(scenarie, efterAlarm(), T0 + min(11));
    expect(r.tilstand.aktivAlarm).toBeNull();
    expect(r.tilstand.fase).toBe('ROLIG');
    expect(slags(r.udgaaende, 'ALARM_STOPPET')).toHaveLength(1);
  });

  test('lukker ogsaa aabne anomalier', () => {
    const r = stop(scenarie, efterAlarm(), T0 + min(11));
    expect(r.tilstand.fyrede['a1']?.oploestKl).toBe(iso(T0 + min(11)));
  });

  test('genfyrer ikke alarmen ved naeste tick', () => {
    const stoppet = stop(scenarie, efterAlarm(), T0 + min(11)).tilstand;
    const r = tick(scenarie, stoppet, T0 + min(30));
    expect(fyrede(r)).toEqual([]);
    expect(r.tilstand.fase).toBe('ROLIG');
    expect(r.tilstand.aktivAlarm).toBeNull();
  });

  test('stop uden aktiv alarm er en stille ikke-handling', () => {
    const r = stop(scenarie, nyTilstand(scenarie, T0), T0 + min(1));
    expect(slags(r.udgaaende, 'ALARM_STOPPET')).toHaveLength(0);
  });
});

describe('fyrNu - live-trigger fra telefonen', () => {
  const scenarie = medHaendelser(bygAlarm({ at: iso(T0 + min(164)) }));

  test('overstyrer det planlagte tidspunkt', () => {
    const r = fyrNu(scenarie, nyTilstand(scenarie, T0), 'alarm-hoved', T0 + min(30));
    expect(fyrede(r)).toEqual(['alarm-hoved']);
    expect(r.tilstand.fase).toBe('ALARM');
    expect(r.tilstand.aktivAlarm?.fyretKl).toBe(iso(T0 + min(30)));
  });

  test('faar ikke haendelsen til at fyre igen paa det planlagte tidspunkt', () => {
    const fyret = fyrNu(scenarie, nyTilstand(scenarie, T0), 'alarm-hoved', T0 + min(30)).tilstand;
    const r = tick(scenarie, fyret, T0 + min(164));
    expect(fyrede(r)).toEqual([]);
  });

  test('afviser et ukendt id', () => {
    expect(() => fyrNu(scenarie, nyTilstand(scenarie, T0), 'findes-ikke', T0)).toThrow(
      /findes-ikke/,
    );
  });

  test('afviser en haendelse der allerede er fyret', () => {
    const fyret = fyrNu(scenarie, nyTilstand(scenarie, T0), 'alarm-hoved', T0 + min(30)).tilstand;
    expect(() => fyrNu(scenarie, fyret, 'alarm-hoved', T0 + min(31))).toThrow(/allerede/i);
  });
});

describe('dekryptering', () => {
  const scenarie = medHaendelser(
    bygDekryptering({ id: 'd1', at: iso(T0 + min(30)), procent: 34, fragment: 'foerste' }),
    bygDekryptering({ id: 'd2', at: iso(T0 + min(90)), procent: 68, fragment: 'anden' }),
  );

  test('opdaterer procent og fragment naar den fyrer', () => {
    const r = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(30));
    expect(r.tilstand.dekrypteringProcent).toBe(34);
    expect(r.tilstand.dekrypteringFragment).toBe('foerste');
  });

  test('gaar kun fremad gennem natten', () => {
    const t = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(120)).tilstand;
    expect(t.dekrypteringProcent).toBe(68);
    expect(t.dekrypteringFragment).toBe('anden');
  });
});

describe('genoptagelse efter genstart', () => {
  const scenarie = medHaendelser(
    bygAnomali({ id: 'a1', at: iso(T0 + min(30)) }),
    bygAlarm({ at: iso(T0 + min(164)) }),
  );

  test('genfyrer ikke haendelser fra en gemt tilstand', () => {
    // Natten er naaet til kl. 02.20; serveren doer og starter igen.
    const foerNedbrud = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(170)).tilstand;
    const genindlaest = structuredClone(foerNedbrud);

    const r = tick(scenarie, genindlaest, T0 + min(171));

    expect(fyrede(r)).toEqual([]);
    expect(r.tilstand.fase).toBe('ALARM');
    expect(r.tilstand.aktivAlarm?.fyretKl).toBe(iso(T0 + min(170)));
  });

  test('fyrer haendelser der forfaldt mens serveren var nede', () => {
    // Serveren er nede fra kl. 00.00 til kl. 02.50 og skal indhente det forsoemte.
    const foer = tick(scenarie, nyTilstand(scenarie, T0), T0 + min(10)).tilstand;
    const r = tick(scenarie, foer, T0 + min(200));
    expect(fyrede(r)).toEqual(['a1', 'alarm-hoved']);
    expect(r.tilstand.fase).toBe('ALARM');
  });
});

describe('hele natten afspillet i ét stykke', () => {
  test('ender i AFSLUTTET efter at have passeret alle faser', () => {
    const scenarie = medHaendelser(
      bygMelding({ id: 'm1', at: iso(T0 + min(15)) }),
      bygDekryptering({ id: 'd1', at: iso(T0 + min(40)) }),
      bygAnomali({ id: 'a1', at: iso(T0 + min(70)), autoOploesSek: 90 }),
      bygAlarm({ at: iso(T0 + min(164)), optrapningSek: 300 }),
      bygAfslut({ at: iso(T0 + min(220)) }),
    );

    let tilstand = nyTilstand(scenarie, T0);
    const setFaser = new Set<string>();
    for (let m = 0; m <= 240; m += 1) {
      const r = tick(scenarie, tilstand, T0 + min(m));
      tilstand = r.tilstand;
      setFaser.add(tilstand.fase);
    }

    expect([...setFaser]).toEqual(
      expect.arrayContaining(['ROLIG', 'OPTRAPNING', 'ALARM', 'AFSLUTTET']),
    );
    expect(tilstand.fase).toBe('AFSLUTTET');
    expect(Object.keys(tilstand.fyrede).sort()).toEqual(
      ['a1', 'afslut-1', 'alarm-hoved', 'd1', 'm1'].sort(),
    );
    expect(tilstand.fyrede['a1']?.oploestKl).not.toBeNull();
  });
});
