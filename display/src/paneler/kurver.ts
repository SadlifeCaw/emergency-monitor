/**
 * Kurveskriverne: seismik, EMF og temperatur.
 *
 * Tegnet som en papirskriver og ikke som et diagram. Der er ingen akser, ingen
 * gitterkasse og ingen soejler - kun en kontinuert kurve, en svag grundlinje og
 * en pen yderst til hoejre, hvor maalingen sker lige nu. Papiret loeber mod
 * venstre, som paa en seismograf.
 *
 * Kurverne opdateres én gang i sekundet, ikke hvert billede: data aendrer sig
 * kun én gang i sekundet, og skaermen skal koere i seks timer.
 */

import { fastTal } from '../format.js';
import { el, saetTekst } from './panel.js';
import type { Panel } from './panel.js';
import type { Sensorhistorik, Skaermbillede } from '../kontrakt.js';

interface Kurveopsaetning {
  readonly navn: string;
  readonly kanal: keyof Sensorhistorik;
  readonly min: number;
  readonly maks: number;
  readonly heltalscifre: number;
  readonly decimaler: number;
  readonly enhed: string;
  /** Over denne vaerdi skifter tallet til rav. Uro, ikke alarm. */
  readonly uroligOver: number;
}

const KURVER: readonly Kurveopsaetning[] = [
  {
    navn: 'Seismik',
    kanal: 'seismik',
    min: 0,
    maks: 1,
    heltalscifre: 1,
    decimaler: 3,
    enhed: '',
    uroligOver: 0.3,
  },
  {
    navn: 'EMF',
    kanal: 'emf',
    min: 0,
    maks: 1,
    heltalscifre: 1,
    decimaler: 3,
    enhed: '',
    uroligOver: 0.35,
  },
  {
    navn: 'Temperatur',
    kanal: 'temperatur',
    min: 3,
    maks: 15,
    heltalscifre: 2,
    decimaler: 1,
    enhed: '°C',
    uroligOver: 99,
  },
];

const FOSFOR = '#33ff6a';

interface Tegneflade {
  readonly laerred: HTMLCanvasElement;
  readonly vaerdi: HTMLElement;
  readonly opsaetning: Kurveopsaetning;
}

/** Skalerer canvasset til skaermens faktiske pixels. Returnerer CSS-maalene. */
const klargoer = (laerred: HTMLCanvasElement): { ctx: CanvasRenderingContext2D | null; b: number; h: number } => {
  const forhold = window.devicePixelRatio || 1;
  const b = laerred.clientWidth;
  const h = laerred.clientHeight;

  if (laerred.width !== Math.round(b * forhold) || laerred.height !== Math.round(h * forhold)) {
    laerred.width = Math.round(b * forhold);
    laerred.height = Math.round(h * forhold);
  }

  const ctx = laerred.getContext('2d');
  ctx?.setTransform(forhold, 0, 0, forhold, 0, 0);
  return { ctx, b, h };
};

/** Papiret har altid samme laengde, uanset hvor mange maalinger der er. */
const PLADSER = 300;

type Punktvaelger = (i: number) => [number, number];

/** To svage streger, som forrykt papir. Ikke et gitter - en kurveskriver har ikke akser. */
const tegnGrundlinjer = (ctx: CanvasRenderingContext2D, b: number, h: number): void => {
  ctx.strokeStyle = 'rgba(51,255,106,0.07)';
  ctx.lineWidth = 1;
  for (const andel of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(h * andel) + 0.5);
    ctx.lineTo(b, Math.round(h * andel) + 0.5);
    ctx.stroke();
  }
};

/** Fladen under kurven, meget svagt - giver kurven vaegt uden at lyse. */
const tegnFlade = (
  ctx: CanvasRenderingContext2D,
  punkt: Punktvaelger,
  antal: number,
  h: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(punkt(0)[0], h);
  for (let i = 0; i < antal; i += 1) ctx.lineTo(...punkt(i));
  ctx.lineTo(punkt(antal - 1)[0], h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(51,255,106,0.08)';
  ctx.fill();
};

const tegnKurve = (ctx: CanvasRenderingContext2D, punkt: Punktvaelger, antal: number): void => {
  ctx.beginPath();
  for (let i = 0; i < antal; i += 1) {
    const [x, y] = punkt(i);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = FOSFOR;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
};

/** Pennen: der hvor maalingen sker lige nu. */
const tegnPen = (ctx: CanvasRenderingContext2D, [x, y]: [number, number]): void => {
  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = FOSFOR;
  ctx.fill();
};

const tegn = (flade: Tegneflade, vaerdier: readonly number[]): void => {
  const { ctx, b, h } = klargoer(flade.laerred);
  if (!ctx) return;

  ctx.clearRect(0, 0, b, h);
  if (vaerdier.length < 2) return;

  const { min, maks } = flade.opsaetning;
  // Er der faerre maalinger end pladser, begynder kurven inde paa fladen i
  // stedet for at blive strukket ud. Tom plads er aerligt: der ER ingen data.
  const forskydning = Math.max(0, PLADSER - vaerdier.length);
  const punkt: Punktvaelger = (i) => [
    ((i + forskydning) / (PLADSER - 1)) * b,
    h - (((vaerdier[i] as number) - min) / (maks - min)) * h,
  ];

  tegnGrundlinjer(ctx, b, h);
  tegnFlade(ctx, punkt, vaerdier.length, h);
  tegnKurve(ctx, punkt, vaerdier.length);
  tegnPen(ctx, punkt(vaerdier.length - 1));
};

export const lavKurvepanel = (vaert: HTMLElement): Panel => {
  const flader: Tegneflade[] = KURVER.map((opsaetning) => {
    const blok = el('div', 'kurve');
    const hoved = el('div', 'kurve__hoved');
    const vaerdi = el('span', 'kurve__vaerdi', '—');
    hoved.append(el('span', 'felt', opsaetning.navn), vaerdi);

    const laerred = el('canvas', 'kurve__lærred');
    blok.append(hoved, laerred);
    vaert.append(blok);

    return { laerred, vaerdi, opsaetning };
  });

  return {
    opdater: (s: Skaermbillede) => {
      for (const flade of flader) {
        const { kanal, heltalscifre, decimaler, enhed, uroligOver } = flade.opsaetning;
        const nu = s.sensorer[kanal];

        saetTekst(flade.vaerdi, `${fastTal(nu, heltalscifre, decimaler)}${enhed}`);
        flade.vaerdi.dataset['hoej'] = nu > uroligOver ? 'ja' : 'nej';

        tegn(flade, s.historik[kanal]);
      }
    },
  };
};
