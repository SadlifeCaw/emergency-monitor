/**
 * Lydklippet.
 *
 * Spiller filen fra serverens lydmappe og holder styr paa, om det stadig
 * spiller. Klippets laengde kendes kun her, saa det er skaermen - ikke
 * serveren - der afgoer, hvornaar dekrypteringen falder tilbage.
 *
 * Foer klippet gaar en opbygning (se OPBYGNING_SEK): skaermen flimrer,
 * dekrypteringen loeber op, og en stigende lyd naar sit hoejdepunkt lige foer
 * stemmen. Opbygningen er en del af den aktive periode.
 *
 * Aktiv-perioden afhaenger ikke af, om lyden faktisk kom ud: er den blokeret af
 * browseren, eller er "lyd fra" slaaet til, vises transmissionen stadig.
 */

import type { LydklipVisning } from './kontrakt.js';
import { OPBYGNING_SEK, erForbi, opbygningFor, startforskydningSek } from './lydklipregler.js';

export type Klipfase = 'opbygning' | 'spiller';

export interface Klipstatus {
  readonly aktiv: boolean;
  readonly fase: Klipfase;
  /** 0 til 1 under opbygningen, derefter 1. */
  readonly opbygningAndel: number;
  readonly titel: string;
  readonly forloebSek: number;
  /** Null indtil filen er aabnet. */
  readonly varighedSek: number | null;
  /** Browseren naegtede at spille - skaermen er ikke armeret. */
  readonly lydBlokeret: boolean;
}

export interface Lydklip {
  /** Kaldes med hvert skaermbillede. Starter klippet, naar et nyt id dukker op. */
  opdater(klip: LydklipVisning | null, lydFra: boolean): void;
  status(): Klipstatus;
}

export const lavLydklip = (paaSkift: () => void, nu: () => number = Date.now): Lydklip => {
  let id: string | null = null;
  let titel = '';
  let audio: HTMLAudioElement | null = null;
  let afspilTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tidspunktet klippet selv begynder. Ligger i fremtiden under opbygningen. */
  let startMs = 0;
  let opbygningMs = 0;
  let varighedMs: number | null = null;
  /** Hvor langt inde i klippet stemmen starter - det der allerede er spillet. */
  let startOffsetSek = 0;
  let faerdig = false;
  let blokeret = false;

  const luk = (): void => {
    if (afspilTimer !== null) clearTimeout(afspilTimer);
    afspilTimer = null;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  };

  const start = (klip: LydklipVisning, lydFra: boolean): void => {
    luk();
    id = klip.haendelseId;
    titel = klip.titel;
    faerdig = false;
    blokeret = false;
    varighedMs = null;

    startOffsetSek = klip.startSek ?? 0;
    const forskydning = startforskydningSek(klip.sekunderSiden);
    // Hvor i filen stemmen begynder: det tidligere spillede plus evt. genoptagelse.
    const soeg = startOffsetSek + forskydning;
    opbygningMs = opbygningFor(forskydning) * 1000;
    startMs = nu() - forskydning * 1000 + opbygningMs;

    const a = new Audio(`/lyd/${encodeURIComponent(klip.fil)}`);
    a.preload = 'auto';
    a.muted = lydFra;
    audio = a;

    const slut = (): void => {
      if (audio !== a) return;
      faerdig = true;
      paaSkift();
    };

    const afspil = (): void => {
      afspilTimer = null;
      if (audio !== a) return;
      if (soeg > 0) a.currentTime = soeg;
      a.play().catch(() => {
        blokeret = true;
      });
    };

    a.addEventListener('loadedmetadata', () => {
      if (audio !== a) return;
      varighedMs = Number.isFinite(a.duration) ? a.duration * 1000 : null;
      if (erForbi(soeg, varighedMs === null ? null : varighedMs / 1000)) {
        slut();
        return;
      }
      // Stemmen kommer foerst, naar opbygningen er slut.
      afspilTimer = setTimeout(afspil, Math.max(0, startMs - nu()));
    });
    a.addEventListener('ended', slut);
    a.addEventListener('error', slut);
  };

  return {
    opdater: (klip, lydFra) => {
      if (!klip) {
        if (id !== null) {
          luk();
          id = null;
          faerdig = false;
          varighedMs = null;
        }
        return;
      }
      if (klip.haendelseId !== id) start(klip, lydFra);
      if (audio) audio.muted = lydFra;
    },

    status: () => {
      const forloeb = nu() - startMs;
      const iOpbygning = forloeb < 0;
      const udloebet = varighedMs !== null && forloeb + startOffsetSek * 1000 >= varighedMs;
      const andel = iOpbygning
        ? Math.min(1, Math.max(0, 1 + forloeb / Math.max(1, opbygningMs || OPBYGNING_SEK * 1000)))
        : 1;
      return {
        aktiv: id !== null && !faerdig && !udloebet,
        fase: iOpbygning ? 'opbygning' : 'spiller',
        opbygningAndel: andel,
        titel,
        forloebSek: Math.max(0, forloeb) / 1000 + (iOpbygning ? 0 : startOffsetSek),
        varighedSek: varighedMs === null ? null : varighedMs / 1000,
        lydBlokeret: blokeret,
      };
    },
  };
};
