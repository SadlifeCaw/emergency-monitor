/**
 * Skaermbilledet: alt hvad displayet skal bruge, i én besked.
 *
 * Skaermen regner ikke selv noget ud. Den tegner det, den faar. Det er med
 * vilje: afstand og pejling er de tal, fire teenagere skriver af i moerke og
 * gaar efter, og de skal komme fra det samme sted som testene rammer.
 */

import { afstandM, ddmDele, decimalgrader, formaterDdm, pejlingGrader, sektorFor } from '../motor/geo.js';
import { anomaliNu, dekrypteringNu, stemningFra } from '../motor/stemning.js';
import { aflaes } from '../motor/telemetri.js';
import type { Loglinje, Sensoraflaesning } from '../motor/telemetri.js';
import type { Ravage } from '../motor/ravage.js';
import type { Fase, Scenarie, Tilstand } from '../motor/typer.js';

export interface AlarmVisning {
  readonly haendelseId: string;
  readonly titel: string;
  readonly instruks: string;
  readonly naermestePunkt: string;
  readonly sektor: number;
  readonly lat: number;
  readonly lon: number;
  readonly usikkerhedM: number;
  /**
   * Grader og decimalminutter - formatet der skrives af.
   *
   * Null naar instruktoererne har slaaet koordinatet fra. Det holdes bevidst
   * tilbage i stedet for at blive skjult i skaermens CSS: saa er det heller
   * ikke til at laese ved at kigge med i det, serveren sender.
   */
  readonly ddm: string | null;
  /** Samme koordinat delt i to, saa skaermen kan saette dem paa hver sin linje. */
  readonly ddmLat: string | null;
  readonly ddmLon: string | null;
  /** Decimalgrader som i admin ("55.66010"), til at slaa op i Google Maps. Null som ddm. */
  readonly gradLat: string | null;
  readonly gradLon: string | null;
  readonly afstandM: number;
  readonly pejlingGrader: number;
  readonly fyretKl: string;
  readonly kvitteret: boolean;
  readonly sekunderSiden: number;
}

/**
 * Kurveskrivernes papir: de sidste minutters maalinger pr. kanal.
 *
 * Historikken kommer fra serveren og ikke fra klientens hukommelse. Ellers ville
 * en genstart kl. 02.10 give tomme grafer praecis naar rampen op mod alarmen
 * skulle vaere synlig - og rampen er hele grunden til, at graferne findes.
 */
export interface Sensorhistorik {
  readonly seismik: readonly number[];
  readonly emf: readonly number[];
  readonly temperatur: readonly number[];
}

/** Det loebende materiale skaermbilledet samles af. */
export interface Visning {
  readonly log: readonly Loglinje[];
  readonly historik: Sensorhistorik;
}

export interface AnomaliVisning {
  readonly id: string;
  readonly titel: string;
  readonly tekst: string;
  readonly sektor: number;
}

export interface Skaermbillede {
  /** Serverens ur er sandheden. Skaermen regner sin egen afvigelse ud herfra. */
  readonly serverKl: string;
  readonly fase: Fase;
  readonly vagthold: string;
  readonly base: { readonly lat: number; readonly lon: number; readonly label: string };
  readonly kort: Scenarie['kort'];
  readonly sensorer: Sensoraflaesning;
  readonly log: readonly Loglinje[];
  readonly historik: Sensorhistorik;
  readonly dekryptering: { readonly procent: number; readonly fragment: string };
  readonly anomalier: readonly AnomaliVisning[];
  readonly alarm: AlarmVisning | null;
  /** Instruktoerernes forstyrrelser. Skaermen reagerer paa dem, se style/ravage.css. */
  readonly ravage: Ravage;
}

export const bygAlarmvisning = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  nu: number,
): AlarmVisning | null => {
  const aktiv = tilstand.aktivAlarm;
  if (!aktiv) return null;

  const haendelse = scenarie.haendelser.find((h) => h.id === aktiv.haendelseId);
  if (!haendelse || haendelse.type !== 'ALARM') return null;

  const punkt = { lat: haendelse.lat, lon: haendelse.lon };
  const pejling = pejlingGrader(scenarie.base, punkt);
  const skjult = tilstand.ravage.skjulKoordinat;

  return {
    haendelseId: haendelse.id,
    titel: haendelse.titel,
    instruks: haendelse.instruks,
    naermestePunkt: haendelse.naermestePunkt,
    sektor: sektorFor(pejling, scenarie.kort.sektorer),
    lat: haendelse.lat,
    lon: haendelse.lon,
    usikkerhedM: haendelse.usikkerhedM,
    ddm: skjult ? null : formaterDdm(punkt),
    ddmLat: skjult ? null : ddmDele(punkt).lat,
    ddmLon: skjult ? null : ddmDele(punkt).lon,
    gradLat: skjult ? null : decimalgrader(punkt).lat,
    gradLon: skjult ? null : decimalgrader(punkt).lon,
    // Hele meter og hele grader: det er opløsningen et kompas og et par ben har.
    afstandM: Math.round(afstandM(scenarie.base, punkt)),
    pejlingGrader: Math.round(pejling) % 360,
    fyretKl: aktiv.fyretKl,
    kvitteret: aktiv.kvitteretKl !== null,
    sekunderSiden: Math.max(0, Math.floor((nu - Date.parse(aktiv.fyretKl)) / 1000)),
  };
};

/** Den anomali der er i gang lige nu, som en liste med nul eller ét element. */
const stemningsanomalier = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  nu: number,
): readonly AnomaliVisning[] => {
  const a = anomaliNu(stemningFra(scenarie), nu, tilstand.aktivAlarm !== null);
  return a ? [{ id: a.id, titel: a.titel, tekst: a.tekst, sektor: a.sektor }] : [];
};

export const bygSkaermbillede = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  visning: Visning,
  nu: number,
): Skaermbillede => ({
  serverKl: new Date(nu).toISOString(),
  fase: tilstand.fase,
  vagthold: tilstand.vagthold,
  base: { lat: scenarie.base.lat, lon: scenarie.base.lon, label: scenarie.base.label },
  kort: scenarie.kort,
  sensorer: aflaes(scenarie, tilstand, nu),
  log: visning.log,
  historik: visning.historik,
  dekryptering: dekrypteringNu(stemningFra(scenarie), nu),
  // Anomalier og dekryptering genereres af uret, ikke af scenariet. Se
  // motor/stemning.ts - det er derfor der ikke er nogen liste at vedligeholde.
  anomalier: stemningsanomalier(scenarie, tilstand, nu),
  alarm: bygAlarmvisning(scenarie, tilstand, nu),
  ravage: tilstand.ravage,
});
