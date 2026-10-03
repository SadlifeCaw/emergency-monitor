/**
 * Hovedlinjen.
 *
 * Systemets navn, stationen, uret, vagtholdet og én statuslampe. Uret er det
 * stoerste tal paa skaermen efter alarmen - det er det, et vagthold kigger paa,
 * naar de skal notere hvornaar noget skete.
 */

import { lokalTid } from '../format.js';
import { el, saetTekst } from './panel.js';
import type { Panel } from './panel.js';

const FASETEKST: Record<string, string> = {
  ROLIG: 'Overvågning',
  OPTRAPNING: 'Forhøjet aktivitet',
  ALARM: 'Alarm',
  AFSLUTTET: 'Vagten afsluttet',
};

export const lavHovedpanel = (vaert: HTMLElement): Panel => {
  const navn = el('span', 'hoved__navn', 'VASE NATVAGT');
  const station = el('span', 'felt', 'Station Vork');
  const ur = el('span', 'hoved__ur', '--:--:--');

  const vagtholdNavn = el('span', 'felt', 'Vagthold');
  const vagthold = el('span', 'tal', '-');
  const vagtholdFelt = el('span');
  vagtholdFelt.append(vagtholdNavn, document.createTextNode(' '), vagthold);

  const forbindelse = el('span', 'hoved__forbindelse', 'Forbinder');
  forbindelse.dataset['tabt'] = 'ja';

  const lampe = el('span', 'lampe');
  const fase = el('span', 'felt hoved__fase', '-');
  const faseFelt = el('span');
  faseFelt.append(lampe, document.createTextNode(' '), fase);

  const hoejre = el('div', 'hoved__hoejre');
  hoejre.append(vagtholdFelt, forbindelse, faseFelt);

  vaert.append(navn, station, ur, hoejre);

  return {
    opdater: (s) => {
      saetTekst(ur, lokalTid(s.serverKl));
      saetTekst(vagthold, s.vagthold);
      saetTekst(fase, FASETEKST[s.fase] ?? s.fase);
      lampe.dataset['fase'] = s.fase;
      fase.dataset['fase'] = s.fase;
    },
  };
};

/** Forbindelsesvisningen styres udefra, fordi den ikke kommer fra et skaermbillede. */
export const visForbindelse = (vaert: HTMLElement, tabt: boolean, tekst: string): void => {
  const felt = vaert.querySelector<HTMLElement>('.hoved__forbindelse');
  if (!felt) return;
  felt.dataset['tabt'] = tabt ? 'ja' : 'nej';
  felt.textContent = tekst;
};
