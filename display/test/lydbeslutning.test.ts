import { describe, expect, test } from 'vitest';
import { lydbeslutning, tomLydtilstand } from '../src/lydbeslutning.js';
import type { Lydtilstand } from '../src/lydbeslutning.js';

const skaerm = (o: Partial<Parameters<typeof lydbeslutning>[1]> = {}) => ({
  alarmId: null,
  kvitteret: false,
  anomaliIder: [] as string[],
  ...o,
});

const efter = (foer: Lydtilstand, o: Parameters<typeof skaerm>[0]) =>
  lydbeslutning(foer, skaerm(o));

describe('sirenen', () => {
  test('starter naar alarmen falder', () => {
    const r = efter(tomLydtilstand(), { alarmId: 'alarm-hoved' });
    expect(r.handlinger).toContain('START_SIRENE');
  });

  test('starter ikke igen ved naeste opdatering', () => {
    const foerste = efter(tomLydtilstand(), { alarmId: 'alarm-hoved' });
    const anden = efter(foerste.tilstand, { alarmId: 'alarm-hoved' });
    expect(anden.handlinger).toEqual([]);
  });

  test('tier naar vagthavende har kvitteret', () => {
    const foerste = efter(tomLydtilstand(), { alarmId: 'alarm-hoved' });
    const anden = efter(foerste.tilstand, { alarmId: 'alarm-hoved', kvitteret: true });
    expect(anden.handlinger).toContain('STOP_SIRENE');
  });

  test('bliver tavs efter kvittering, ogsaa ved senere opdateringer', () => {
    let t = efter(tomLydtilstand(), { alarmId: 'alarm-hoved' }).tilstand;
    t = efter(t, { alarmId: 'alarm-hoved', kvitteret: true }).tilstand;
    expect(efter(t, { alarmId: 'alarm-hoved', kvitteret: true }).handlinger).toEqual([]);
  });

  test('tier naar alarmen ryddes', () => {
    const foerste = efter(tomLydtilstand(), { alarmId: 'alarm-hoved' });
    const anden = efter(foerste.tilstand, { alarmId: null });
    expect(anden.handlinger).toContain('STOP_SIRENE');
  });

  test('lyder igen ved en ny alarm', () => {
    let t = efter(tomLydtilstand(), { alarmId: 'alarm-1' }).tilstand;
    t = efter(t, { alarmId: null }).tilstand;
    expect(efter(t, { alarmId: 'alarm-2' }).handlinger).toContain('START_SIRENE');
  });

  test('en genforbindelse midt i en alarm starter sirenen igen', () => {
    // Skaermen genindlaeses kl. 03 mens alarmen koerer. Den skal ikke staa tavs.
    expect(efter(tomLydtilstand(), { alarmId: 'alarm-hoved' }).handlinger).toContain(
      'START_SIRENE',
    );
  });

  test('en genforbindelse efter kvittering starter den ikke', () => {
    const r = efter(tomLydtilstand(), { alarmId: 'alarm-hoved', kvitteret: true });
    expect(r.handlinger).not.toContain('START_SIRENE');
  });
});

describe('anomalier', () => {
  test('giver ét blip naar en ny anomali dukker op', () => {
    const r = efter(tomLydtilstand(), { anomaliIder: ['a1'] });
    expect(r.handlinger).toEqual(['BLIP']);
  });

  test('blipper ikke igen for den samme anomali', () => {
    const foerste = efter(tomLydtilstand(), { anomaliIder: ['a1'] });
    expect(efter(foerste.tilstand, { anomaliIder: ['a1'] }).handlinger).toEqual([]);
  });

  test('blipper for en ny anomali senere paa natten', () => {
    const foerste = efter(tomLydtilstand(), { anomaliIder: ['a1'] });
    const anden = efter(foerste.tilstand, { anomaliIder: [] });
    expect(efter(anden.tilstand, { anomaliIder: ['a2'] }).handlinger).toEqual(['BLIP']);
  });

  test('blipper kun én gang, selv om to anomalier kommer samtidig', () => {
    expect(efter(tomLydtilstand(), { anomaliIder: ['a1', 'a2'] }).handlinger).toEqual(['BLIP']);
  });

  test('blipper ikke naar en anomali afskrives', () => {
    const foerste = efter(tomLydtilstand(), { anomaliIder: ['a1'] });
    expect(efter(foerste.tilstand, { anomaliIder: [] }).handlinger).toEqual([]);
  });

  test('en anomali under en alarm blipper ikke - sirenen har ordet', () => {
    const foerste = efter(tomLydtilstand(), { alarmId: 'alarm-hoved' });
    const anden = efter(foerste.tilstand, { alarmId: 'alarm-hoved', anomaliIder: ['a9'] });
    expect(anden.handlinger).not.toContain('BLIP');
  });
});
