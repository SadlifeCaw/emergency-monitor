/**
 * Telemetri: sensoraflaesninger og logstroem.
 *
 * Alt her er deterministisk. Samme scenarie, samme tilstand og samme tidspunkt
 * giver altid samme tal - saa generalproeven ser ud som natten, og en klient der
 * genforbinder kl. 03 kan regne den samme historik ud som den, der aldrig mistede
 * forbindelsen.
 */

import { pejlingGrader, sektorFor } from './geo.js';
import { anomaliNu, stemningFra } from './stemning.js';
import { ADVARSEL, ALARM, RUTINE } from './logpuljer.js';
import { enhedsStoej, vaelg } from './stoej.js';
import type { Scenarie, Tilstand } from './typer.js';

/** Sekunder mellem to loglinjer. */
export const LOG_INTERVAL_SEK = 12;

/** Hvor haardt en aaben anomali trykker paa sensorerne. Maerkbart, men ikke alarmerende. */
const ANOMALI_PAAVIRKNING = 0.35;

const KANAL = { seismik: 1, emf: 2, temperatur: 3, log: 4 } as const;

const TEMPERATUR_START = 12.5;
const TEMPERATUR_FALD = 6;
const TEMPERATUR_KULDEDYK = 1.5;

export type Logniveau = 'RUTINE' | 'ADVARSEL' | 'ALARM';

export interface Loglinje {
  readonly kl: string;
  readonly niveau: Logniveau;
  readonly tekst: string;
}

export interface Sensoraflaesning {
  /** 0-1. */
  readonly seismik: number;
  /** 0-1. */
  readonly emf: number;
  /** Grader celsius. */
  readonly temperatur: number;
  /** 0-1. Hvor meget haendelserne trykker paa maalingerne lige nu. */
  readonly paavirkning: number;
}

const klip = (v: number, lav: number, hoej: number): number => Math.min(hoej, Math.max(lav, v));

const tickIndeks = (nu: number): number => Math.floor(nu / 1000);

/**
 * Hvor meget natten trykker paa sensorerne lige nu.
 *
 * Rampen op mod alarmen er med vilje synlig, foer alarmen falder. Et vagthold,
 * der rent faktisk kigger paa graferne, skal kunne naa at rejse sig et halvt
 * minut i forvejen. Opmaerksomhed skal kunne betale sig.
 */
export const paavirkning = (scenarie: Scenarie, tilstand: Tilstand, nu: number): number => {
  if (tilstand.aktivAlarm) return 1;

  let hoejeste = anomaliNu(stemningFra(scenarie), nu, false) ? ANOMALI_PAAVIRKNING : 0;

  for (const h of scenarie.haendelser) {
    if (h.type !== 'ALARM' || h.id in tilstand.fyrede) continue;
    const at = Date.parse(h.at);
    const vindue = h.optrapningSek * 1000;
    if (vindue === 0 || nu < at - vindue) continue;
    hoejeste = Math.max(hoejeste, klip((nu - (at - vindue)) / vindue, 0, 1));
  }

  return hoejeste;
};

export const aflaes = (scenarie: Scenarie, tilstand: Tilstand, nu: number): Sensoraflaesning => {
  const t = tickIndeks(nu);
  const p = paavirkning(scenarie, tilstand, nu);

  const seismikBase = 0.04 + 0.06 * enhedsStoej(scenarie.seed, KANAL.seismik, t);
  const emfBase = 0.05 + 0.1 * enhedsStoej(scenarie.seed, KANAL.emf, t);

  const seismik = klip(
    seismikBase + p * (0.8 + 0.12 * enhedsStoej(scenarie.seed, KANAL.seismik, t, 7)),
    0,
    1,
  );
  const emf = klip(emfBase + p * (0.7 + 0.15 * enhedsStoej(scenarie.seed, KANAL.emf, t, 7)), 0, 1);

  return {
    seismik: Number(seismik.toFixed(3)),
    emf: Number(emf.toFixed(3)),
    temperatur: Number(temperatur(scenarie, nu, p, t).toFixed(1)),
    paavirkning: Number(p.toFixed(3)),
  };
};

/** Doegnrytme: koeligere mod morgenstunden, med et ekstra dyk naar noget sker. */
const temperatur = (scenarie: Scenarie, nu: number, p: number, t: number): number => {
  const start = Date.parse(scenarie.vagt.start);
  const slut = Date.parse(scenarie.vagt.slut);
  const andel = klip((nu - start) / Math.max(1, slut - start), 0, 1);
  const stoej = (enhedsStoej(scenarie.seed, KANAL.temperatur, t) - 0.5) * 0.8;

  return TEMPERATUR_START - TEMPERATUR_FALD * andel - p * TEMPERATUR_KULDEDYK + stoej;
};

const niveauFor = (scenarie: Scenarie, tilstand: Tilstand, nu: number): Logniveau => {
  if (tilstand.fase === 'ALARM') return 'ALARM';
  if (anomaliNu(stemningFra(scenarie), nu, false)) return 'ADVARSEL';
  return 'RUTINE';
};

/**
 * Hvilken sektor loglinjen skal naevne.
 *
 * Under en alarm er svaret alarmens egen sektor, udledt af geometrien praecis
 * som paa skaermen. Ellers ville loggen kunne skrive "bekraeftet aktivitet
 * sektor 1", mens udrykningsfeltet siger sektor 2 - og et vagthold, der
 * opdager den slags kl. 02, holder op med at stole paa skaermen.
 *
 * Ved en aaben anomali bruges dens sektor. Kun i rutinedrift vandrer
 * sweepet frit gennem sektorerne.
 */
const sektorFor_log = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  t: number,
  nu: number,
): number => {
  const aktiv = tilstand.aktivAlarm;
  if (aktiv) {
    const h = scenarie.haendelser.find((x) => x.id === aktiv.haendelseId);
    if (h?.type === 'ALARM') {
      return sektorFor(pejlingGrader(scenarie.base, h), scenarie.kort.sektorer);
    }
  }

  const aaben = anomaliNu(stemningFra(scenarie), nu, tilstand.aktivAlarm !== null);
  if (aaben) return aaben.sektor;

  // Der taelles i loglinjer, ikke i sekunder. Med sekunder springer taelleren
  // 12 ad gangen, og fordi 12 og 8 deler faktoren 4, ville rutineloggen kun
  // naevne to af de otte sektorer hele natten.
  return 1 + (Math.abs(Math.floor(t / LOG_INTERVAL_SEK)) % scenarie.kort.sektorer);
};

const PULJER: Record<Logniveau, readonly string[]> = {
  RUTINE: RUTINE,
  ADVARSEL: ADVARSEL,
  ALARM: ALARM,
};

/**
 * Genererer den loglinje, der hoerer til dette tidspunkt - eller null, hvis
 * tidspunktet ikke ligger paa logintervallet.
 *
 * At linjen er en funktion af tiden og ikke af en taeller er med vilje: en
 * genstart midt i natten giver den samme log som den, der aldrig gik ned.
 */
export const genererLoglinje = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  nu: number,
): Loglinje | null => {
  const t = tickIndeks(nu);
  if (t % LOG_INTERVAL_SEK !== 0) return null;

  const niveau = niveauFor(scenarie, tilstand, nu);
  const sektor = sektorFor_log(scenarie, tilstand, t, nu);
  const skabelon = vaelg(PULJER[niveau], scenarie.seed, KANAL.log, t);

  return { kl: new Date(nu).toISOString(), niveau, tekst: skabelon.replaceAll('%S', String(sektor)) };
};
