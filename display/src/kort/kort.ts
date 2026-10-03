/**
 * Kortpanelet.
 *
 * Kortet er bevidst ubetjeneligt: ingen zoom, ingen traek, ingen taster.
 * Deltagerne har hverken mus eller tastatur, og et kort, der ved et uheld er
 * blevet trukket skaevt kl. 03, er vaerre end intet kort.
 *
 * Det eneste kortet gør af sig selv, er at flytte blikket til alarmpunktet,
 * naar alarmen falder - og tilbage igen, naar den er ovre.
 */

import L from 'leaflet';
import { leafletLayer } from 'protomaps-leaflet';
import { BAGGRUND, kortEtiketregler, kortMaleregler } from './flavor.js';
import {
  FARVER,
  lavBaselag,
  lavGitterlag,
  lavOverlaystyring,
  lavRinglag,
  lavSektorlag,
} from './overlays.js';
import type { Overlaystyring } from './overlays.js';
import { lavSweep } from './sweep.js';
import type { Sweep, Sweepgeometri } from './sweep.js';
import type { Punkt } from './geometri.js';
import type { Skaermbillede } from '../kontrakt.js';

/** Stien serveren udstiller det lokale kort paa. Ingen internetopslag. */
const KORTFIL = '/kort/vork.pmtiles';
/** Protomaps' basemap-data gaar til zoom 15; derover overzoomer vi. */
const MAKS_DATAZOOM = 15;
/** Hvor meget luft der er om basen og alarmpunktet, naar kortet flytter blikket. */
const ALARM_LUFT = 0.6;

export interface Kortopsaetning {
  /** Falsk naar assets/maps/vork.pmtiles mangler. Saa tegnes et noedgitter i stedet. */
  readonly harBasiskort: boolean;
}

export interface Kort {
  opdater(skaermbillede: Skaermbillede): void;
  /** Meter pr. skaermpixel ved kortets nuvaerende zoom. 0 foer kortet er bygget. */
  meterPrPixel(): number;
  destroy(): void;
}

interface Kortdele {
  readonly kort: L.Map;
  readonly base: Punkt;
  readonly overlays: Overlaystyring;
  readonly startZoom: number;
}

const lavLeafletkort = (vaert: HTMLElement, base: Punkt, zoom: number): L.Map =>
  L.map(vaert, {
    center: [base.lat, base.lon],
    zoom,
    zoomSnap: 0.25,
    attributionControl: false,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    inertia: false,
  });

const tilfoejBasiskort = (kort: L.Map): void => {
  leafletLayer({
    url: KORTFIL,
    paintRules: kortMaleregler(),
    labelRules: kortEtiketregler(),
    backgroundColor: BAGGRUND,
    maxDataZoom: MAKS_DATAZOOM,
    noWrap: true,
  }).addTo(kort);
};

const byg = (vaert: HTMLElement, opsaetning: Kortopsaetning, s: Skaermbillede): Kortdele => {
  const base: Punkt = { lat: s.base.lat, lon: s.base.lon };
  const kort = lavLeafletkort(vaert, base, s.kort.startZoom);

  if (opsaetning.harBasiskort) {
    tilfoejBasiskort(kort);
  } else {
    lavGitterlag(base, s.kort.maxRadiusM).addTo(kort);
  }

  lavBaselag(base, s.base.label).addTo(kort);
  lavRinglag(base, s.kort.maxRadiusM).addTo(kort);
  lavSektorlag(base, s.kort.sektorer, s.kort.maxRadiusM).addTo(kort);

  return {
    kort,
    base,
    startZoom: s.kort.startZoom,
    overlays: lavOverlaystyring(kort, base, s.kort.sektorer, s.kort.maxRadiusM),
  };
};

const opdaterAlarm = (dele: Kortdele, s: Skaermbillede): void => {
  const { kort, base, overlays } = dele;

  if (!s.alarm) {
    if (overlays.ryddAlarm()) {
      kort.setView([base.lat, base.lon], dele.startZoom, { animate: true });
    }
    return;
  }

  if (!overlays.visAlarm(s.alarm)) return;

  // Flyt blikket, saa baade lejren og punktet er i billedet. De skal kunne se
  // hvor langt det er, ikke bare hvor det er.
  kort.flyToBounds(
    L.latLngBounds([base.lat, base.lon], [s.alarm.lat, s.alarm.lon]).pad(ALARM_LUFT),
    { duration: 2.5 },
  );
};

/**
 * Starter sweepet om basen.
 *
 * Sweepet roterer om lejren, ogsaa naar kortet har flyttet blikket til
 * alarmpunktet. Radius maales med en ResizeObserver og ikke i tegneloekken:
 * laesninger af clientWidth 60 gange i sekundet tvinger layout.
 */
const startSweep = (sweepCanvas: HTMLCanvasElement, hentDele: () => Kortdele | null): Sweep => {
  let radiusPx = 0;
  const maal = (): void => {
    radiusPx = Math.hypot(sweepCanvas.clientWidth, sweepCanvas.clientHeight);
  };
  maal();
  new ResizeObserver(maal).observe(sweepCanvas);

  const geometri = (): Sweepgeometri | null => {
    const dele = hentDele();
    if (!dele) return null;
    const p = dele.kort.latLngToContainerPoint([dele.base.lat, dele.base.lon]);
    return { cx: p.x, cy: p.y, radiusPx, farve: FARVER.FOSFOR };
  };

  const sweep = lavSweep(sweepCanvas, geometri);
  sweep.start();
  return sweep;
};

export const lavKort = (
  vaert: HTMLElement,
  sweepCanvas: HTMLCanvasElement,
  opsaetning: Kortopsaetning = { harBasiskort: true },
): Kort => {
  let dele: Kortdele | null = null;
  const sweep = startSweep(sweepCanvas, () => dele);

  return {
    /** Maalt paa selve kortet, saa skalaen foelger med gennem alarmens zoom. */
    meterPrPixel: () => {
      if (!dele) return 0;
      const { kort } = dele;
      const midt = kort.getSize().divideBy(2);
      return kort
        .containerPointToLatLng(midt)
        .distanceTo(kort.containerPointToLatLng(midt.add(L.point(100, 0)))) / 100;
    },

    opdater: (s) => {
      dele ??= byg(vaert, opsaetning, s);
      opdaterAlarm(dele, s);
      dele.overlays.visAnomalier(s.anomalier.map((a) => a.sektor));
    },

    destroy: () => {
      sweep.stop();
      dele?.kort.remove();
      dele = null;
    },
  };
};
