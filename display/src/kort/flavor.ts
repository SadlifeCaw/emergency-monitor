/**
 * Fosfor-paletten til kortet.
 *
 * Kortet er baggrund, ikke indhold. Det skal give et vagthold nok terraen til at
 * genkende sig selv - veje, vand, skov - og saa holde mund. Alt hvad der lyser
 * kraftigt paa skaermen, skal vaere noget VI har tegnet: basen, ringene,
 * sektorerne og frem for alt alarmpunktet.
 *
 * Derfor: alle kortfarver ligger i det nederste, dæmpede spektrum, og
 * etiketterne er slaaet helt fra. Den fulde fosforgroenne er reserveret til
 * vores egne overlays.
 */

import { namedFlavor } from '@protomaps/basemaps';
import { paintRules } from 'protomaps-leaflet';
import type { LabelRule, PaintRule } from 'protomaps-leaflet';

/** Baggrunden. Ikke ren sort - en anelse varm, saa skaermen ikke virker doed. */
export const BAGGRUND = '#0d110d';

const DYBT = '#101e16';
const TERRAEN = '#13291b';
const VAND = '#123d2c';
const BYGNING = '#25442f';
const VEJ_SMAL = '#26503a';
const VEJ_MELLEM = '#33764a';
const VEJ_BRED = '#3f9558';
const SPOR = '#2b5e3c';
const GRAENSE = '#418c58';

/**
 * Bygger paa "black"-flavoren, saa alle 72 farvenoegler har en fornuftig
 * udgangsvaerdi, og overskriver dem vi bruger.
 */
const FOSFOR_FLAVOR = {
  ...namedFlavor('black'),

  background: BAGGRUND,
  earth: BAGGRUND,

  water: VAND,
  ocean_label: DYBT,

  park_a: TERRAEN,
  park_b: TERRAEN,
  wood_a: TERRAEN,
  wood_b: TERRAEN,
  scrub_a: TERRAEN,
  scrub_b: TERRAEN,
  pedestrian: DYBT,
  industrial: DYBT,
  hospital: DYBT,
  school: DYBT,
  zoo: DYBT,
  military: DYBT,
  sand: DYBT,
  beach: DYBT,
  glacier: DYBT,
  aerodrome: DYBT,
  runway: SPOR,

  buildings: BYGNING,

  other: VEJ_SMAL,
  minor_service: VEJ_SMAL,
  minor_a: VEJ_SMAL,
  minor_b: VEJ_SMAL,
  link: VEJ_MELLEM,
  major: VEJ_MELLEM,
  highway: VEJ_BRED,

  minor_service_casing: DYBT,
  minor_casing: DYBT,
  link_casing: DYBT,
  major_casing_early: DYBT,
  major_casing_late: DYBT,
  highway_casing_early: DYBT,
  highway_casing_late: DYBT,

  railway: SPOR,
  pier: SPOR,
  boundaries: GRAENSE,

  tunnel_other: DYBT,
  tunnel_minor: DYBT,
  tunnel_link: DYBT,
  tunnel_major: DYBT,
  tunnel_highway: DYBT,
  bridges_other: VEJ_SMAL,
  bridges_minor: VEJ_SMAL,
  bridges_link: VEJ_MELLEM,
  bridges_major: VEJ_MELLEM,
  bridges_highway: VEJ_BRED,
};

export const kortMaleregler = (): PaintRule[] => paintRules(FOSFOR_FLAVOR);

/**
 * Ingen kortetiketter.
 *
 * Vagtholdet navigerer paa pejling og afstand, ikke paa vejnavne. Hvert stykke
 * tekst, kortet selv tegner, er noget der kan forveksles med vores eget - og om
 * natten er den forveksling dyr.
 *
 * Funktionen findes - i stedet for bare at sende en tom liste fra kort.ts - saa
 * fravalget staar ét sted og laeses som et valg, ikke som en forglemmelse.
 */
export const kortEtiketregler = (): LabelRule[] => [];
