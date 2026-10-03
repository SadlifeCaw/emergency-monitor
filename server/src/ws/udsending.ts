/**
 * WebSocket-udsending.
 *
 * Holder styr paa de forbundne skaerme og sender skaermbilledet ud ved hvert tick.
 * Doede forbindelser ryddes ved udsendelse - ellers vokser saettet stille gennem
 * natten, hver gang skaermen genforbinder.
 */

const AABEN = 1; // WebSocket.OPEN

/** Det mindste en klient skal kunne, for at vi kan sende til den. */
export interface Klient {
  send(data: string): void;
  readonly readyState: number;
}

export interface Udsending {
  tilfoej(klient: Klient): void;
  fjern(klient: Klient): void;
  udsend(besked: unknown): void;
  antalKlienter(): number;
  /** Tidspunkt for seneste tilslutning. Admin bruger det til at se, om skaermen lever. */
  sidsteTilslutning(): number | null;
}

export const lavUdsending = (naa: () => number = Date.now): Udsending => {
  const klienter = new Set<Klient>();
  let sidste: number | null = null;

  return {
    tilfoej: (klient) => {
      klienter.add(klient);
      sidste = naa();
    },

    fjern: (klient) => {
      klienter.delete(klient);
    },

    udsend: (besked) => {
      const tekst = JSON.stringify(besked);
      for (const klient of klienter) {
        if (klient.readyState !== AABEN) {
          klienter.delete(klient);
          continue;
        }
        try {
          klient.send(tekst);
        } catch {
          // En doed forbindelse maa ikke kunne vaelte tick-loopet.
          klienter.delete(klient);
        }
      }
    },

    antalKlienter: () => klienter.size,
    sidsteTilslutning: () => sidste,
  };
};
