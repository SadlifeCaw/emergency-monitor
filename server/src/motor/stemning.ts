/**
 * Stemning: det der sker af sig selv.
 *
 * Monitoren koerer hele ugen i ét straek, og anomalier og dekryptering skal
 * hverken planlaegges, gemmes eller ses i admin. De udledes derfor af uret,
 * praecis som telemetrien allerede goer - en ren funktion af (seed, tidspunkt).
 *
 * Det giver tre ting, en liste af haendelser ikke kunne:
 *
 *  - Der er intet, der vokser. Systemet kan koere i syv doegn uden at samle
 *    tilstand op.
 *  - En genstart kl. 03 giver samme nat som den, der aldrig gik ned.
 *  - Der er ingen liste at vedligeholde. Instruktoererne skal kun forholde sig
 *    til alarmen.
 *
 * Alt her holder sig inden for nattevinduet. Om dagen koerer skaermen roligt
 * videre med sweep, kurver og rutinelog - men der sker ikke noget.
 */

import { ANOMALI_TEKSTER, DEKRYPTERINGSFRAGMENTER } from './logpuljer.js';
import { enhedsStoej, hash32, vaelg } from './stoej.js';
import type { Scenarie } from './typer.js';

/** Lejren lever i dansk tid, uanset hvad maskinens ur er sat til. */
const TIDSZONE = 'Europe/Copenhagen';

/** Natten deles i vinduer af denne laengde; hoejst én anomali pr. vindue. */
const VINDUE_MIN = 15;

const ANOMALI_MINDST_SEK = 60;
const ANOMALI_LAENGST_SEK = 130;

const KANAL = { anomali: 11, dekryptering: 12 } as const;

export interface Natvindue {
  /** "23:00" */
  readonly fra: string;
  /** "05:00" */
  readonly til: string;
}

export interface Stemningsopsaetning {
  readonly seed: number;
  readonly natvindue: Natvindue;
  /** Hvor mange udslag der i snit skal komme paa en nat. */
  readonly anomalierPrNat: number;
}

export interface Anomalistemning {
  /** Skifter naar en ny anomali begynder. Bruges til at opdage skiftet. */
  readonly id: string;
  readonly titel: string;
  readonly tekst: string;
  readonly sektor: number;
}

export interface Dekrypteringsstemning {
  readonly procent: number;
  readonly fragment: string;
}

/** Klokkeslaettet som decimaltal i dansk tid: 23:45 bliver til 23.75. */
export const timeIZone = (nu: number, tidszone = TIDSZONE): number => {
  const dele = new Intl.DateTimeFormat('en-GB', {
    hour12: false,
    timeZone: tidszone,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(nu));

  const tal = (slags: 'hour' | 'minute'): number =>
    Number(dele.find((d) => d.type === slags)?.value ?? '0');

  return (tal('hour') % 24) + tal('minute') / 60;
};

const tilTimer = (klokkeslaet: string): number => {
  const [t = '0', m = '0'] = klokkeslaet.split(':');
  return Number(t) + Number(m) / 60;
};

/** Er vi inde i nattevinduet? Haandterer at det gaar over midnat. */
export const erNat = (nu: number, vindue: Natvindue): boolean => {
  const t = timeIZone(nu);
  const fra = tilTimer(vindue.fra);
  const til = tilTimer(vindue.til);
  return fra <= til ? t >= fra && t < til : t >= fra || t < til;
};

/**
 * Hvilket vindue er vi i?
 *
 * Nummereres fra epoken, saa to nætter aldrig faar de samme numre - og saa
 * samme tidspunkt altid giver samme vindue, ogsaa efter en genstart.
 */
const vinduesnummer = (nu: number): number => Math.floor(nu / (VINDUE_MIN * 60_000));

/**
 * Den anomali der er i gang lige nu, hvis nogen.
 *
 * Hvert vindue traekker én gang: sker der noget, hvornaar inde i vinduet,
 * hvor laenge, i hvilken sektor og med hvilken tekst. Alt sammen af seedet,
 * saa der ikke skal huskes noget mellem to tick.
 */
export const anomaliNu = (
  { seed, natvindue, anomalierPrNat }: Stemningsopsaetning,
  nu: number,
  alarmAktiv: boolean,
): Anomalistemning | null => {
  // Sirenen har ordet. Et gult udslag midt i en alarm ville kun forvirre.
  if (alarmAktiv || !erNat(nu, natvindue)) return null;

  const vindue = vinduesnummer(nu);
  const vinduerPrNat = (tilTimer(natvindue.til) - tilTimer(natvindue.fra) + 24) % 24 * (60 / VINDUE_MIN);
  const sandsynlighed = Math.min(1, anomalierPrNat / Math.max(1, vinduerPrNat));

  if (enhedsStoej(seed, KANAL.anomali, vindue) >= sandsynlighed) return null;

  // Hvornaar inde i vinduet, og hvor laenge.
  const start =
    vindue * VINDUE_MIN * 60_000 +
    Math.floor(enhedsStoej(seed, KANAL.anomali, vindue, 1) * (VINDUE_MIN - 3) * 60_000);
  const varighed =
    (ANOMALI_MINDST_SEK +
      enhedsStoej(seed, KANAL.anomali, vindue, 2) * (ANOMALI_LAENGST_SEK - ANOMALI_MINDST_SEK)) *
    1000;

  if (nu < start || nu >= start + varighed) return null;

  const tekst = vaelg(ANOMALI_TEKSTER, seed, KANAL.anomali, vindue, 3);
  return {
    id: `stemning-${vindue}`,
    titel: tekst.titel,
    tekst: tekst.tekst,
    sektor: 1 + (hash32(seed, KANAL.anomali, vindue, 4) % 8),
  };
};

/** Mindste ordlaengde der maa overstreges. Smaaord ser ud som stoej. */
const MINDSTE_ORD = 4;

/**
 * Overstreger et par ord i fragmentet.
 *
 * Sproget er laant fra papirarbejdet: det man ikke ved, staar som en sort
 * bjaelke inde i saetningen - ikke som blokke efter den. Hvilke ord der
 * daekkes, afhaenger kun af fragmentet selv, saa bjaelken staar stille, saa
 * laenge teksten vises.
 */
const overstreg = (fragment: string, noegle: number): string => {
  const ord = fragment.split(' ');
  const kandidater = ord
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.length >= MINDSTE_ORD && !o.includes('.'));

  if (kandidater.length === 0) return fragment;

  const antal = 1 + (hash32(noegle, 1) % Math.min(2, kandidater.length));
  const daekket = new Set<number>();
  for (let n = 0; n < antal; n += 1) {
    const valgt = kandidater[hash32(noegle, 2 + n) % kandidater.length];
    if (valgt) daekket.add(valgt.i);
  }

  return ord.map((o, i) => (daekket.has(i) ? '█'.repeat(o.length) : o)).join(' ');
};

/**
 * Dekrypteringspanelet.
 *
 * Ren stemning: tallet skal se ud som om systemet arbejder, ikke fortaelle en
 * historie. Det stiger og falder langsomt, og fragmentet skifter en gang imellem.
 *
 * Kultens navn afsloeres paa papir, ikke her.
 */
export const dekrypteringNu = (
  { seed }: Stemningsopsaetning,
  nu: number,
): Dekrypteringsstemning => {
  // To langsomme boelger lagt oven paa hinanden, saa tallet ikke virker
  // mekanisk. Perioderne er valgt saa der sker noget over et kvarter, men
  // ingenting fra sekund til sekund.
  const langsom = Math.sin(nu / (17 * 60_000));
  const langsommere = Math.sin(nu / (41 * 60_000) + 1.3);
  const procent = Math.round(55 + 22 * langsom + 14 * langsommere);

  // Fragmentet skifter ca. hvert 20. minut.
  const bid = Math.floor(nu / (20 * 60_000));

  const fragment = vaelg(DEKRYPTERINGSFRAGMENTER, seed, KANAL.dekryptering, bid);

  return {
    procent: Math.min(100, Math.max(0, procent)),
    fragment: overstreg(fragment, hash32(seed, KANAL.dekryptering, bid)),
  };
};

/** Stemningens opsaetning, laest ud af scenariet. */
export const stemningFra = (scenarie: Scenarie): Stemningsopsaetning => ({
  seed: scenarie.seed,
  natvindue: scenarie.nat,
  anomalierPrNat: scenarie.nat.anomalierPrNat,
});
