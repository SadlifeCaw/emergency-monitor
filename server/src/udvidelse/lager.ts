/**
 * Lageret til udvidelsespakken.
 *
 * Ligger i sin egen fil ved siden af koerselstilstanden, saa pakken hverken kan
 * beskadige nattens tilstand eller blive slettet af en aendring i den.
 *
 * Findes filen ikke, foedes den fra planen (`scenarios/signaltaarne.json`),
 * hvis den findes. Saa kan en hel nats signaltaarne forprogrammeres i haanden
 * og ligge klar, foer nogen har aabnet telefonen.
 */

import { gemJson, laesJson, sletJson } from '../lager/jsonlager.js';
import { TAARN_MAKS_M, tomUdvidelse, udvidelseSkema } from './udvidelse.js';
import type { Udvidelse } from './udvidelse.js';

/** Gemte taarne fra foer graensen paa 800 m faar deres interval klippet til. */
const klip = (raa: unknown): unknown => {
  if (typeof raa !== 'object' || raa === null || !('taarne' in raa)) return raa;
  const r = raa as { taarne?: unknown };
  if (!Array.isArray(r.taarne)) return raa;
  return {
    ...r,
    taarne: r.taarne.map((t: unknown) =>
      typeof t === 'object' && t !== null && 'maksM' in t
        ? { ...t, maksM: Math.min(Number((t as { maksM: unknown }).maksM), TAARN_MAKS_M) }
        : t,
    ),
  };
};

const tolk = (raa: unknown): Udvidelse => udvidelseSkema.parse(klip(raa));

/** Planen alene - bruges ogsaa naar natten nulstilles. */
export const laesPlan = async (planSti: string): Promise<Udvidelse> =>
  (await laesJson(planSti, tolk, 'signalplan')) ?? tomUdvidelse();

/**
 * Findes en gemt pakke fra foer signaltaarnene, har den ingen `taarne`-noegle.
 * Saa foedes taarnene fra planen, og alt andet i den gemte pakke bevares.
 */
export const laesUdvidelse = async (sti: string, planSti: string): Promise<Udvidelse> => {
  const raa = await laesJson<unknown>(sti, (r) => r, 'udvidelsespakke');
  if (raa === null) return laesPlan(planSti);

  const gemt = tolk(raa);
  const harTaarn = typeof raa === 'object' && raa !== null && 'taarne' in raa;
  if (harTaarn) return gemt;

  const plan = await laesPlan(planSti);
  return { ...gemt, taarne: plan.taarne, taarnLyd: gemt.taarnLyd ?? plan.taarnLyd };
};

export const gemUdvidelse = (sti: string, u: Udvidelse): Promise<void> => gemJson(sti, u);

export const sletUdvidelse = (sti: string): Promise<void> => sletJson(sti);
