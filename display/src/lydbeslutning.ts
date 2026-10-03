/**
 * Hvornaar der skal lyde noget.
 *
 * Skilt ud fra selve lydafspilningen, fordi beslutningen er den del, der kan
 * gaa galt: en sirene der ikke starter, en sirene der ikke tier efter
 * kvittering, eller et blip der gentages hvert sekund hele natten. Her er den
 * en ren funktion, saa den kan afproeves uden en hoejttaler.
 */

export type Lydhandling = 'START_SIRENE' | 'STOP_SIRENE' | 'BLIP';

export interface Lydtilstand {
  /** Alarmen sirenen koerer for, eller null. */
  readonly sirenerFor: string | null;
  /** Anomalier vi allerede har blippet for. */
  readonly kendteAnomalier: readonly string[];
}

export interface Lydinput {
  readonly alarmId: string | null;
  readonly kvitteret: boolean;
  readonly anomaliIder: readonly string[];
}

export interface Lydresultat {
  readonly tilstand: Lydtilstand;
  readonly handlinger: readonly Lydhandling[];
}

export const tomLydtilstand = (): Lydtilstand => ({
  sirenerFor: null,
  kendteAnomalier: [],
});

export const lydbeslutning = (foer: Lydtilstand, nu: Lydinput): Lydresultat => {
  const handlinger: Lydhandling[] = [];

  // Sirenen skal koere, naar der er en ubekraeftet alarm - ogsaa hvis skaermen
  // lige er genindlaest midt i den. Den skal tie, saa snart vagthavende har
  // kvitteret, eller alarmen er ryddet.
  const boerSirene = nu.alarmId !== null && !nu.kvitteret;
  const sirenerFor = boerSirene ? nu.alarmId : null;

  if (boerSirene && foer.sirenerFor !== nu.alarmId) {
    handlinger.push('START_SIRENE');
  } else if (!boerSirene && foer.sirenerFor !== null) {
    handlinger.push('STOP_SIRENE');
  }

  // Et blip pr. gang en anomali dukker op - ikke ét pr. anomali, og ikke ét i
  // sekundet mens den staar aaben. Under en alarm er der stille: sirenen har ordet.
  const nye = nu.anomaliIder.filter((id) => !foer.kendteAnomalier.includes(id));
  if (nye.length > 0 && !boerSirene) {
    handlinger.push('BLIP');
  }

  return {
    tilstand: { sirenerFor, kendteAnomalier: [...nu.anomaliIder] },
    handlinger,
  };
};
