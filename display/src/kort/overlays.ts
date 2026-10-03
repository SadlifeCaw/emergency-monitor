/**
 * Vores egne lag oven paa kortet: base, afstandsringe, sektorer og alarmpunkt.
 *
 * Det er de eneste ting paa kortet, der har lov at lyse. Kortet under dem er
 * med vilje dæmpet - se flavor.ts.
 */

import L from 'leaflet';
import { punktIRetning, ringradier, sektorlinjer, sektormidte } from './geometri.js';
import type { Punkt } from './geometri.js';

const FOSFOR = '#33ff6a';
const ALARM = '#ff2b2b';
const RAV = '#ffb000';

const tilLatLng = (p: Punkt): L.LatLngExpression => [p.lat, p.lon];

const maerkat = (punkt: Punkt, tekst: string, klasse: string): L.Marker =>
  L.marker(tilLatLng(punkt), {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({ className: `kort-maerkat ${klasse}`, html: tekst, iconSize: [0, 0] }),
  });

/** Basen: et fast kryds, saa oejet altid kan finde lejren igen. */
export const lavBaselag = (base: Punkt, label: string): L.LayerGroup =>
  L.layerGroup([
    L.circleMarker(tilLatLng(base), {
      radius: 5,
      color: FOSFOR,
      weight: 1.5,
      fillColor: FOSFOR,
      fillOpacity: 0.9,
      interactive: false,
    }),
    L.circleMarker(tilLatLng(base), {
      radius: 12,
      color: FOSFOR,
      weight: 1,
      opacity: 0.45,
      fill: false,
      interactive: false,
    }),
    maerkat(base, label, 'kort-maerkat--base'),
  ]);

/**
 * Afstandsringene med paaskrevet meterangivelse.
 *
 * Etiketten sidder mod nordoest, hvor der sjaeldent er andet - og altid samme
 * sted, saa den kan aflæses uden at lede.
 */
export const lavRinglag = (base: Punkt, maxRadiusM: number): L.LayerGroup => {
  const lag: L.Layer[] = [];

  for (const radius of ringradier(maxRadiusM)) {
    const yderst = radius === maxRadiusM;
    lag.push(
      L.circle(tilLatLng(base), {
        radius,
        color: FOSFOR,
        weight: yderst ? 1.2 : 0.8,
        opacity: yderst ? 0.45 : 0.25,
        dashArray: yderst ? undefined : '3 6',
        fill: false,
        interactive: false,
      }),
      maerkat(punktIRetning(base, 45, radius), `${radius} m`, 'kort-maerkat--ring'),
    );
  }

  return L.layerGroup(lag);
};

/** Sektorlinjer og sektornumre. Numrene gaar igen i loggen og i alarmteksten. */
export const lavSektorlag = (
  base: Punkt,
  antalSektorer: number,
  radiusM: number,
): L.LayerGroup => {
  const lag: L.Layer[] = sektorlinjer(base, antalSektorer, radiusM).map((linje) =>
    L.polyline([tilLatLng(linje.fra), tilLatLng(linje.til)], {
      color: FOSFOR,
      weight: 0.6,
      opacity: 0.2,
      interactive: false,
    }),
  );

  for (let n = 1; n <= antalSektorer; n += 1) {
    const midte = punktIRetning(base, sektormidte(n, antalSektorer), radiusM * 0.86);
    lag.push(maerkat(midte, String(n), 'kort-maerkat--sektor'));
  }

  return L.layerGroup(lag);
};

export interface Alarmpunkt {
  readonly lat: number;
  readonly lon: number;
  readonly usikkerhedM: number;
  readonly sektor: number;
  readonly afstandM: number;
  readonly pejlingGrader: number;
}

/**
 * Alarmpunktet.
 *
 * Usikkerhedsradius tegnes med, fordi den er aerlig: systemet ved ikke praecis
 * hvor det er. En prik alene ville love mere, end maalingen kan holde.
 * Linjen fra basen giver retningen paa ét blik, foer nogen har laest et tal.
 */
export const lavAlarmlag = (base: Punkt, alarm: Alarmpunkt): L.LayerGroup => {
  const punkt: Punkt = { lat: alarm.lat, lon: alarm.lon };

  return L.layerGroup([
    L.polyline([tilLatLng(base), tilLatLng(punkt)], {
      color: ALARM,
      weight: 1,
      opacity: 0.5,
      dashArray: '6 6',
      interactive: false,
    }),
    L.circle(tilLatLng(punkt), {
      radius: alarm.usikkerhedM,
      color: ALARM,
      weight: 1,
      opacity: 0.7,
      fillColor: ALARM,
      fillOpacity: 0.12,
      interactive: false,
      className: 'kort-alarm-usikkerhed',
    }),
    L.circleMarker(tilLatLng(punkt), {
      radius: 6,
      color: ALARM,
      weight: 2,
      fillColor: ALARM,
      fillOpacity: 1,
      interactive: false,
      className: 'kort-alarm-prik',
    }),
    maerkat(
      punkt,
      `${alarm.afstandM} m &middot; ${String(alarm.pejlingGrader).padStart(3, '0')}&deg;`,
      'kort-maerkat--alarm',
    ),
  ]);
};

/** Gul markering af den sektor, en ubekraeftet anomali ligger i. */
export const lavAnomalilag = (
  base: Punkt,
  sektorer: readonly number[],
  antalSektorer: number,
  radiusM: number,
): L.LayerGroup =>
  L.layerGroup(
    sektorer.map((n) =>
      maerkat(
        punktIRetning(base, sektormidte(n, antalSektorer), radiusM * 0.62),
        '?',
        'kort-maerkat--anomali',
      ),
    ),
  );

export const FARVER = { FOSFOR, ALARM, RAV } as const;

/**
 * Nødgitter: bruges naar der ikke er noget basiskort.
 *
 * Dette er projektets fallback, og den ser bevidst anderledes ud end specens
 * oprindelige plan om et raster-billede. Grunden er, at et vagthold ikke
 * navigerer efter vejnavne, men efter pejling og afstand - og de tal staar
 * paa skaermen uanset hvad kortet viser. Et gitter med ringe, sektorer og
 * alarmpunkt er derfor fuldt brugbart, og det har ingen bevaegelige dele
 * der kan svigte.
 *
 * Prisen er, at man ikke kan genkende terraenet. Viser generalproeven i fase 9,
 * at det er noedvendigt, kan et raster-udsnit laegges ind som ekstra lag.
 */
export const lavGitterlag = (base: Punkt, maxRadiusM: number): L.LayerGroup => {
  const lag: L.Layer[] = [];
  const skridt = maxRadiusM / 4;

  for (let i = -4; i <= 4; i += 1) {
    const nord = punktIRetning(base, 0, i * skridt);
    const oest = punktIRetning(base, 90, i * skridt);
    const stil = { color: FOSFOR, weight: 0.5, opacity: 0.12, interactive: false };

    lag.push(
      L.polyline(
        [
          tilLatLng(punktIRetning({ lat: base.lat, lon: oest.lon }, 0, maxRadiusM)),
          tilLatLng(punktIRetning({ lat: base.lat, lon: oest.lon }, 180, maxRadiusM)),
        ],
        stil,
      ),
      L.polyline(
        [
          tilLatLng(punktIRetning({ lat: nord.lat, lon: base.lon }, 90, maxRadiusM)),
          tilLatLng(punktIRetning({ lat: nord.lat, lon: base.lon }, 270, maxRadiusM)),
        ],
        stil,
      ),
    );
  }

  return L.layerGroup(lag);
};

export interface Overlaystyring {
  visAlarm(alarm: Alarmpunkt & { haendelseId: string }): boolean;
  ryddAlarm(): boolean;
  visAnomalier(sektorer: readonly number[]): void;
}

/**
 * Ejer de lag, der kommer og gaar gennem natten.
 *
 * Lagt her frem for i kort.ts, saa den foranderlige tilstand - hvilket
 * alarmlag ligger paa kortet lige nu - bor ét sted sammen med de funktioner,
 * der aendrer den.
 */
export const lavOverlaystyring = (
  kort: L.Map,
  base: Punkt,
  antalSektorer: number,
  maxRadiusM: number,
): Overlaystyring => {
  let alarmlag: L.LayerGroup | null = null;
  let anomalilag: L.LayerGroup | null = null;
  let alarmId: string | null = null;

  return {
    /** Returnerer true, hvis alarmen er ny og kortet derfor skal flytte blikket. */
    visAlarm: (alarm) => {
      if (alarm.haendelseId === alarmId) return false;
      if (alarmlag) kort.removeLayer(alarmlag);
      alarmlag = lavAlarmlag(base, alarm).addTo(kort);
      alarmId = alarm.haendelseId;
      return true;
    },

    /** Returnerer true, hvis der faktisk blev ryddet en alarm. */
    ryddAlarm: () => {
      if (!alarmlag) return false;
      kort.removeLayer(alarmlag);
      alarmlag = null;
      alarmId = null;
      return true;
    },

    visAnomalier: (sektorer) => {
      if (anomalilag) kort.removeLayer(anomalilag);
      anomalilag = sektorer.length
        ? lavAnomalilag(base, sektorer, antalSektorer, maxRadiusM).addTo(kort)
        : null;
    },
  };
};
