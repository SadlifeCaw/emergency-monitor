/**
 * Integrationstest: hele natten gennem den rigtige sammenkobling.
 *
 * Den koerer det faktiske scenarie fra scenarios/nat.json gennem den faktiske
 * runtime - motor, lager og udsending - paa et styret ur. Det er den test, der
 * svarer paa spoergsmaalet, natten afhaenger af: falder alarmen, og kan
 * systemet genoptage sig selv, hvis serveren doer undervejs.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startNatvagt } from '../src/drift/natvagt.js';
import type { Skaermbillede } from '../src/drift/skaermbillede.js';
import { laesTilstand } from '../src/lager/tilstandslager.js';
import { testUr } from '../src/motor/ur.js';
import type { Konfig } from '../src/konfig.js';

const ROD = resolve(import.meta.dirname, '../..');
const VAGT_START = Date.parse('2026-07-15T23:30:00+02:00');
const ALARM_KL = Date.parse('2026-07-16T02:14:00+02:00');
const min = (n: number) => n * 60_000;

let mappe = '';
let konfig: Konfig;

beforeEach(async () => {
  mappe = await mkdtemp(join(tmpdir(), 'natvagt-int-'));
  konfig = {
    miljoe: 'udvikling',
    vaert: '127.0.0.1',
    port: 0,
    adminToken: 'kun-til-test-token-1234',
    tokenErGenereret: true,
    scenariesti: resolve(ROD, 'scenarios/nat.json'),
    tilstandssti: join(mappe, 'runtime.json'),
    hastighed: 1,
    virtuelStart: null,
    logloft: 50,
  };
});

afterEach(async () => {
  await rm(mappe, { recursive: true, force: true });
});

/** Starter en natvagt paa et styret ur og samler alt, den sender ud. */
const lavNatvagt = async (start: number) => {
  const ur = testUr(start);
  const udsendt: Skaermbillede[] = [];
  const natvagt = await startNatvagt({ konfig, udsend: (s) => udsendt.push(s), ur });
  return { ur, udsendt, natvagt };
};

describe('det rigtige scenarie', () => {
  test('kan indlaeses og valideres', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    expect(natvagt.scenarie().navn).toBe('VASE Natvagt E26');
    // Kun alarmer staar i filen. Anomalier og dekryptering genereres af uret.
    expect(natvagt.scenarie().haendelser.every((h) => h.type === 'ALARM')).toBe(true);
  });

  test('starter i ROLIG ved vagtens begyndelse', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    await natvagt.skridt();
    expect(natvagt.tilstand().fase).toBe('ROLIG');
    expect(natvagt.skaermbillede().alarm).toBeNull();
  });
});

describe('tick-loopet', () => {
  test('sender et skaermbillede ud ved hvert skridt', async () => {
    const { ur, udsendt, natvagt } = await lavNatvagt(VAGT_START);
    for (let i = 0; i < 5; i += 1) {
      await natvagt.skridt();
      ur.spol(1000);
    }
    expect(udsendt).toHaveLength(5);
  });

  test('skriver kun til disk naar noget faktisk skete', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);

    // Fem stille sekunder helt i begyndelsen: ingen haendelser, ingen skrivning.
    for (let i = 0; i < 5; i += 1) {
      await natvagt.skridt();
      ur.spol(1000);
    }
    await expect(readFile(konfig.tilstandssti, 'utf8')).rejects.toThrow();

    // Naar alarmen fyres, skal der ligge en tilstand paa disken.
    await natvagt.fyrHaendelse('alarm-hoved');
    await expect(laesTilstand(konfig.tilstandssti)).resolves.not.toBeNull();
  });

  test('fylder loggen op og holder sig under loftet', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    for (let i = 0; i < 400; i += 1) {
      await natvagt.skridt();
      ur.spol(12_000); // ét logtick pr. skridt
    }
    expect(natvagt.skaermbillede().log).toHaveLength(konfig.logloft);
  });
});

describe('alarmen', () => {
  test('falder paa det planlagte tidspunkt med afstand, pejling og koordinat', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);

    ur.saet(ALARM_KL - 1000);
    await natvagt.skridt();
    expect(natvagt.skaermbillede().alarm).toBeNull();
    expect(natvagt.tilstand().fase).toBe('OPTRAPNING');

    ur.saet(ALARM_KL);
    await natvagt.skridt();

    const alarm = natvagt.skaermbillede().alarm;
    expect(alarm).not.toBeNull();
    expect(alarm?.afstandM).toBe(394);
    expect(alarm?.pejlingGrader).toBe(60);
    expect(alarm?.ddm).toBe("55°39.606'N 009°21.888'E");
    expect(alarm?.naermestePunkt).toBe('P15 TREKANTSDEPOT');
  });

  test('ligger inden for den rekognoscerede radius', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    ur.saet(ALARM_KL);
    await natvagt.skridt();
    const s = natvagt.skaermbillede();
    expect(s.alarm?.afstandM).toBeLessThanOrEqual(s.kort.maxRadiusM);
  });

  test('varsles af graferne foer den falder', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);

    ur.saet(VAGT_START + min(30));
    await natvagt.skridt();
    const rolig = natvagt.skaermbillede().sensorer.seismik;

    ur.saet(ALARM_KL - 60_000);
    await natvagt.skridt();
    const foerAlarm = natvagt.skaermbillede().sensorer.seismik;

    expect(foerAlarm).toBeGreaterThan(rolig + 0.2);
  });
});

describe('genoptagelse efter nedbrud', () => {
  test('genoptager natten uden at genfyre alarmen', async () => {
    // Natten koeres frem forbi alarmen.
    const foerste = await lavNatvagt(VAGT_START);
    foerste.ur.saet(ALARM_KL + min(5));
    await foerste.natvagt.skridt();
    const fyretKl = foerste.natvagt.skaermbillede().alarm?.fyretKl;
    expect(fyretKl).toBeDefined();

    // Serveren doer og starter igen paa den samme tilstandsfil.
    const anden = await lavNatvagt(ALARM_KL + min(6));
    await anden.natvagt.skridt();

    const alarm = anden.natvagt.skaermbillede().alarm;
    expect(alarm?.fyretKl).toBe(fyretKl);
    expect(anden.natvagt.tilstand().fase).toBe('ALARM');
  });

  test('indhenter haendelser der forfaldt mens serveren var nede', async () => {
    const foerste = await lavNatvagt(VAGT_START);
    await foerste.natvagt.skridt();

    // Nede fra vagtstart til efter alarmen.
    const anden = await lavNatvagt(ALARM_KL + min(1));
    await anden.natvagt.skridt();

    expect(anden.natvagt.tilstand().fase).toBe('ALARM');
    expect(anden.natvagt.skaermbillede().alarm?.afstandM).toBe(394);
  });
});

describe('hele natten fra ende til anden', () => {
  test('passerer rolig, optrapning og alarm', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    const faser = new Set<string>();
    let saaAlarm = false;

    // Ét skridt i minuttet fra vagtstart til efter alarmen.
    for (let m = 0; m <= 200; m += 1) {
      ur.saet(VAGT_START + min(m));
      await natvagt.skridt();
      faser.add(natvagt.tilstand().fase);
      if (natvagt.skaermbillede().alarm) saaAlarm = true;
    }

    // Der er ingen AFSLUTTET laengere: monitoren koerer hele ugen og slutter
    // ikke af sig selv. Alarmen bliver staaende, til nogen stopper den.
    expect([...faser].sort()).toEqual(['ALARM', 'OPTRAPNING', 'ROLIG']);
    expect(saaAlarm).toBe(true);
    expect(natvagt.tilstand().fase).toBe('ALARM');
  });
});

describe('kurveskrivernes historik', () => {
  test('fyldes op ét maalepunkt i sekundet', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    for (let i = 0; i < 30; i += 1) {
      await natvagt.skridt();
      ur.spol(1000);
    }
    const h = natvagt.skaermbillede().historik;
    expect(h.seismik).toHaveLength(30);
    expect(h.emf).toHaveLength(30);
    expect(h.temperatur).toHaveLength(30);
  });

  test('holder et fast loft, saa hukommelsen ikke vokser gennem natten', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    for (let i = 0; i < 400; i += 1) {
      await natvagt.skridt();
      ur.spol(1000);
    }
    expect(natvagt.skaermbillede().historik.seismik).toHaveLength(300);
  });

  test('viser hele optrapningen, naar alarmen falder', async () => {
    // Historikvinduet er lige saa langt som optrapningen. Naar alarmen falder,
    // skal kurven altsaa vise hele opbygningen - fra rolig til udslag.
    const { ur, natvagt } = await lavNatvagt(ALARM_KL - min(6));
    for (let i = 0; i < 360; i += 1) {
      await natvagt.skridt();
      ur.spol(1000);
    }

    const seismik = natvagt.skaermbillede().historik.seismik;
    expect(seismik).toHaveLength(300);
    expect(Math.min(...seismik)).toBeLessThan(0.2);
    expect(Math.max(...seismik)).toBeGreaterThan(0.8);
  });
});

describe('admin-kommandoer', () => {
  test('fyrer alarmen foer tid', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    ur.saet(VAGT_START + min(30));
    await natvagt.skridt();

    await natvagt.fyrHaendelse('alarm-hoved');

    expect(natvagt.tilstand().fase).toBe('ALARM');
    expect(natvagt.skaermbillede().alarm?.afstandM).toBe(394);
  });

  test('kvitterer, saa sirenen kan tie', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    await natvagt.fyrHaendelse('alarm-hoved');
    await natvagt.kvitterAlarm();
    expect(natvagt.skaermbillede().alarm?.kvitteret).toBe(true);
  });

  test('stopper alarmen og genfyrer den ikke', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    await natvagt.fyrHaendelse('alarm-hoved');
    await natvagt.stopAlarm();
    expect(natvagt.tilstand().fase).toBe('ROLIG');

    ur.saet(ALARM_KL + min(10));
    await natvagt.skridt();
    expect(natvagt.skaermbillede().alarm).toBeNull();
  });

  test('afviser en haendelse der ikke findes', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    await expect(natvagt.fyrHaendelse('findes-ikke')).rejects.toThrow(/findes-ikke/);
  });

  test('en afvist kommando braekker ikke koeen for de naeste', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    await expect(natvagt.fyrHaendelse('findes-ikke')).rejects.toThrow();

    // Naeste kommando og naeste tick skal stadig virke.
    await natvagt.fyrHaendelse('alarm-hoved');
    await natvagt.skridt();
    expect(natvagt.tilstand().fase).toBe('ALARM');
  });
});

describe('kommandokoeen', () => {
  test('en kommando midt i et tick mister ikke tickets virkning', async () => {
    // Uden serialisering ville kommandoen laese tilstanden, foer ticket havde
    // skrevet sin - og den ene ville overskrive den anden. Det ville vise sig
    // som "jeg trykkede FYR, og der skete ingenting".
    const { ur, natvagt } = await lavNatvagt(VAGT_START);

    // En ekstra haendelse, saa ticket ogsaa har noget at udrette.
    await natvagt.opretHaendelse({
      id: 'ekstra',
      type: 'MELDING',
      at: new Date(VAGT_START + min(10)).toISOString(),
      titel: 'MELDING',
      tekst: 'EN',
      lyd: 'ingen',
    });
    ur.saet(VAGT_START + min(20));

    const tickLoefte = natvagt.skridt(); // med vilje ikke afventet
    const fyrLoefte = natvagt.fyrHaendelse('alarm-hoved');
    await Promise.all([tickLoefte, fyrLoefte]);

    const fyrede = Object.keys(natvagt.tilstand().fyrede);
    expect(fyrede).toContain('ekstra'); // tickets virkning
    expect(fyrede).toContain('alarm-hoved'); // kommandoens virkning
  });

  test('mange kommandoer paa én gang udfoeres alle sammen', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);

    await Promise.all([
      natvagt.opretHaendelse({
        id: 'ekstra-1',
        type: 'MELDING',
        at: new Date(VAGT_START + min(40)).toISOString(),
        titel: 'MELDING',
        tekst: 'EN',
        lyd: 'ingen',
      }),
      natvagt.opretHaendelse({
        id: 'ekstra-2',
        type: 'MELDING',
        at: new Date(VAGT_START + min(50)).toISOString(),
        titel: 'MELDING',
        tekst: 'TO',
        lyd: 'ingen',
      }),
    ]);

    const ider = natvagt.scenarie().haendelser.map((h) => h.id);
    expect(ider).toContain('ekstra-1');
    expect(ider).toContain('ekstra-2');
  });
});

describe('scenarieaendringer fra telefonen', () => {
  test('flytter alarmens tidspunkt', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    const nyTid = new Date(ALARM_KL + min(20)).toISOString();

    await natvagt.retHaendelsen('alarm-hoved', { at: nyTid });

    expect(natvagt.scenarie().haendelser.find((h) => h.id === 'alarm-hoved')?.at).toBe(nyTid);
  });

  test('en flyttet alarm fyrer paa det nye tidspunkt, ikke det gamle', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    await natvagt.retHaendelsen('alarm-hoved', {
      at: new Date(ALARM_KL + min(20)).toISOString(),
    });

    ur.saet(ALARM_KL + min(1));
    await natvagt.skridt();
    expect(natvagt.skaermbillede().alarm).toBeNull();

    ur.saet(ALARM_KL + min(21));
    await natvagt.skridt();
    expect(natvagt.skaermbillede().alarm).not.toBeNull();
  });

  test('afviser et koordinat uden for den rekognoscerede radius', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    await expect(
      natvagt.retHaendelsen('alarm-hoved', { lat: 55.72, lon: 9.47 }),
    ).rejects.toThrow(/m fra basen/);
  });

  test('aendringer overlever en genstart', async () => {
    const nyTid = new Date(ALARM_KL + min(30)).toISOString();
    const foerste = await lavNatvagt(VAGT_START);
    await foerste.natvagt.retHaendelsen('alarm-hoved', { at: nyTid });

    const anden = await lavNatvagt(VAGT_START);
    expect(anden.natvagt.scenarie().haendelser.find((h) => h.id === 'alarm-hoved')?.at).toBe(
      nyTid,
    );
  });

  test('roerer ikke selve planen paa disken', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    const foer = await readFile(konfig.scenariesti, 'utf8');
    await natvagt.retHaendelsen('alarm-hoved', {
      at: new Date(ALARM_KL + min(30)).toISOString(),
    });
    expect(await readFile(konfig.scenariesti, 'utf8')).toBe(foer);
  });

  test('aflyser en planlagt haendelse', async () => {
    const { natvagt } = await lavNatvagt(VAGT_START);
    await natvagt.aflysHaendelse('alarm-hoved');
    expect(natvagt.scenarie().haendelser.map((h) => h.id)).not.toContain('alarm-hoved');
  });

  test('naegter at aflyse en alarm der er i gang', async () => {
    // Ellers ville koerselstilstanden staa og pege paa en haendelse, der ikke
    // laengere findes - og skaermen ville vaere i ALARM uden at vise noget.
    const { natvagt } = await lavNatvagt(VAGT_START);
    await natvagt.fyrHaendelse('alarm-hoved');
    await expect(natvagt.aflysHaendelse('alarm-hoved')).rejects.toThrow(/stop alarmen/i);
  });
});

describe('nulstil natten', () => {
  test('bringer alt tilbage til planen', async () => {
    const { ur, natvagt } = await lavNatvagt(VAGT_START);
    await natvagt.retHaendelsen('alarm-hoved', {
      at: new Date(ALARM_KL + min(30)).toISOString(),
    });
    await natvagt.fyrHaendelse('alarm-hoved');
    ur.saet(VAGT_START + min(60));
    await natvagt.skridt();

    await natvagt.nulstilNatten();

    expect(natvagt.tilstand().fyrede).toEqual({});
    expect(natvagt.tilstand().fase).toBe('ROLIG');
    expect(natvagt.scenarie().haendelser.find((h) => h.id === 'alarm-hoved')?.at).toBe(
      '2026-07-16T02:14:00+02:00',
    );
  });

  test('en genstart efter nulstilling begynder ogsaa forfra', async () => {
    const foerste = await lavNatvagt(VAGT_START);
    await foerste.natvagt.fyrHaendelse('alarm-hoved');
    await foerste.natvagt.nulstilNatten();

    const anden = await lavNatvagt(VAGT_START);
    expect(anden.natvagt.tilstand().fyrede).toEqual({});
  });
});
