/**
 * Tilstandslager.
 *
 * Koerselstilstanden skrives ved hver aendring, saa natten kan genoptages efter
 * en genstart. Selve den atomiske skrivning ligger i jsonlager.ts.
 */

import { z } from 'zod';
import { gemJson, laesJson, sletJson } from './jsonlager.js';
import type { Tilstand } from '../motor/typer.js';

export { LagerFejl } from './jsonlager.js';

const tilstandSkema = z.object({
  scenarioId: z.string(),
  startetKl: z.string(),
  fase: z.enum(['ROLIG', 'OPTRAPNING', 'ALARM', 'AFSLUTTET']),
  fyrede: z.record(
    z.string(),
    z.object({ fyretKl: z.string(), oploestKl: z.string().nullable() }),
  ),
  tvungne: z.record(z.string(), z.string()),
  aktivAlarm: z
    .object({
      haendelseId: z.string(),
      fyretKl: z.string(),
      kvitteretKl: z.string().nullable(),
    })
    .nullable(),
  dekrypteringProcent: z.number(),
  dekrypteringFragment: z.string().nullable(),
  vagthold: z.string(),
  // Standard, saa en tilstand gemt foer ravage blev til stadig kan laeses.
  ravage: z
    .object({
      sloeretKort: z.boolean(),
      skjulKoordinat: z.boolean(),
      glitch: z.boolean(),
      // Standard, saa en tilstand gemt foer kontakten fandtes stadig kan laeses.
      maalingsfejl: z.boolean().default(false),
    })
    .default({ sloeretKort: false, skjulKoordinat: false, glitch: false, maalingsfejl: false }),
});

export const laesTilstand = async (sti: string): Promise<Tilstand | null> =>
  laesJson(sti, (raa) => tilstandSkema.parse(raa) as Tilstand, 'tilstand');

export const gemTilstand = async (sti: string, tilstand: Tilstand): Promise<void> =>
  gemJson(sti, tilstand);

/** Fjerner den gemte tilstand. Bruges naar natten nulstilles. */
export const sletTilstand = async (sti: string): Promise<void> => sletJson(sti);
