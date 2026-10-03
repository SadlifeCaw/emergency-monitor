/**
 * Delte typer for scenarie-motoren.
 *
 * Alt her er data, ikke adfaerd. Motoren er en ren funktion over disse typer,
 * saa hele natten kan afspilles deterministisk i en test.
 */

export type HaendelseType = 'ANOMALI' | 'DEKRYPTERING' | 'MELDING' | 'ALARM' | 'AFSLUT';

export type Fase = 'ROLIG' | 'OPTRAPNING' | 'ALARM' | 'AFSLUTTET';

export type Lyd = 'ingen' | 'blip' | 'alert' | 'sirene';

export interface Punkt {
  readonly lat: number;
  readonly lon: number;
}

export interface Base extends Punkt {
  readonly label: string;
  readonly verificeret: boolean;
}

export interface Kortopsaetning {
  readonly startZoom: number;
  readonly maxRadiusM: number;
  readonly sektorer: number;
}

/**
 * Hvornaar der maa ske noget af sig selv.
 *
 * Monitoren koerer hele ugen, men anomalier hoerer natten til. Uden for
 * vinduet koerer skaermen roligt videre - sweep, kurver og rutinelog - men
 * der sker ingenting.
 */
export interface Natopsaetning {
  /** "23:00" */
  readonly fra: string;
  /** "05:00" */
  readonly til: string;
  /** Hvor mange udslag der i snit skal komme paa en nat. */
  readonly anomalierPrNat: number;
}

export interface Vagtvindue {
  /** ISO 8601 med tidszone. */
  readonly start: string;
  readonly slut: string;
}

interface HaendelseFaelles {
  readonly id: string;
  /** Planlagt tidspunkt, ISO 8601 med tidszone. */
  readonly at: string;
  readonly titel: string;
  readonly lyd: Lyd;
}

export interface Anomali extends HaendelseFaelles {
  readonly type: 'ANOMALI';
  readonly sektor: number;
  readonly tekst: string;
  /** Sekunder til systemet selv afskriver udslaget som ingenting. */
  readonly autoOploesSek: number;
}

export interface Dekryptering extends HaendelseFaelles {
  readonly type: 'DEKRYPTERING';
  readonly procent: number;
  readonly fragment: string;
}

export interface Melding extends HaendelseFaelles {
  readonly type: 'MELDING';
  readonly tekst: string;
}

export interface Alarm extends HaendelseFaelles {
  readonly type: 'ALARM';
  readonly lat: number;
  readonly lon: number;
  readonly usikkerhedM: number;
  // Ingen sektor her: den udledes af pejlingen fra basen. Se geo.sektorFor.
  readonly naermestePunkt: string;
  readonly instruks: string;
  /** Sekunder foer `at` hvor graferne begynder at reagere. */
  readonly optrapningSek: number;
}

export interface Afslut extends HaendelseFaelles {
  readonly type: 'AFSLUT';
  readonly tekst: string;
}

export type Haendelse = Anomali | Dekryptering | Melding | Alarm | Afslut;

export interface Scenarie {
  readonly version: 1;
  readonly navn: string;
  readonly seed: number;
  readonly base: Base;
  readonly kort: Kortopsaetning;
  /** Perioden monitoren koerer i - hele kurset, ikke én nat. */
  readonly vagt: Vagtvindue;
  readonly nat: Natopsaetning;
  /**
   * Alarmerne.
   *
   * Anomalier og dekryptering staar ikke her: de genereres af uret, se
   * stemning.ts. Listen indeholder derfor kun det, instruktoererne selv
   * bestemmer - og i praksis oprettes alarmerne fra telefonen undervejs.
   */
  readonly haendelser: readonly Haendelse[];
}

export interface FyretHaendelse {
  readonly fyretKl: string;
  /** Kun sat for anomalier, der er afskrevet igen. */
  readonly oploestKl: string | null;
}

export interface AktivAlarm {
  readonly haendelseId: string;
  readonly fyretKl: string;
  /** Sat naar admin har kvitteret. Sirenen tier, punktet bliver staaende. */
  readonly kvitteretKl: string | null;
}

import type { Ravage } from './ravage.js';

export interface Tilstand {
  readonly scenarioId: string;
  readonly startetKl: string;
  readonly fase: Fase;
  readonly fyrede: Readonly<Record<string, FyretHaendelse>>;
  /** Haendelser som admin har tvunget i gang foer tid: id -> ISO-tidspunkt. */
  readonly tvungne: Readonly<Record<string, string>>;
  readonly aktivAlarm: AktivAlarm | null;
  readonly dekrypteringProcent: number;
  readonly dekrypteringFragment: string | null;
  readonly vagthold: string;
  /** Instruktoerernes forstyrrelser af skaermen. Se ravage.ts. */
  readonly ravage: Ravage;
}

export type UdgaaendeBegivenhed =
  | { readonly slags: 'HAENDELSE_FYRET'; readonly haendelse: Haendelse; readonly kl: string }
  | { readonly slags: 'ANOMALI_OPLOEST'; readonly haendelseId: string; readonly kl: string }
  | { readonly slags: 'FASE_SKIFT'; readonly fra: Fase; readonly til: Fase; readonly kl: string }
  | { readonly slags: 'ALARM_KVITTERET'; readonly haendelseId: string; readonly kl: string }
  | { readonly slags: 'ALARM_STOPPET'; readonly haendelseId: string; readonly kl: string }
  | { readonly slags: 'RAVAGE_AENDRET'; readonly ravage: Ravage; readonly kl: string };

export interface Tickresultat {
  readonly tilstand: Tilstand;
  readonly udgaaende: readonly UdgaaendeBegivenhed[];
}
