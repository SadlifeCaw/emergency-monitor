/**
 * Indkommende transmission.
 *
 * Vises mens lydklippet spiller - og i opbygningen foer det. Bevidst en helt
 * anden slags objekt end alarmen: ravfarvet (ubekraeftet), ikke roedt, og uden
 * at overtage layoutet.
 *
 * I opbygningen vokser panelet fra et svagt signal til fuld styrke, og skaermen
 * omkring det flimrer mere og mere (CSS-variablen --opbygning, 0 til 1). Naar
 * stemmen kommer, er der ro igen.
 *
 * Teksten siger det, deltagerne ellers ville spoerge om: systemet kan kun hoere
 * den ene part i samtalen - den udgaaende. Den anden parts svar opfanges ikke.
 * Det vises som to linjer, én pr. part, saa det er til at se paa et blik.
 */

import { blokmeter, forloebet } from '../format.js';
import type { Klipstatus } from '../lydklip.js';
import { el, saetTekst } from './panel.js';

const METERBREDDE = 28;
/**
 * Transmissionen er modtaget tidligere - det her er en genafspilning. Det er
 * kun til historien: klokkeslaettet er det, den oprindelig blev optaget.
 */
const OPTAGET_KL = '15:24';
const RAMMER_MS = 66;
const RAMMER_ROLIG_MS = 250;
const ROLIG = '(prefers-reduced-motion: reduce)';

export interface Indkommendepanel {
  /** Tegner panelet, naar klippet er aktivt - skjuler det ellers. */
  opdater(aktiv: boolean): void;
}

/** Et signal der ligner tale: to hurtige boelger under en langsom indhyllende. */
const udsving = (x: number, t: number): number => {
  const indhylling =
    0.35 + 0.65 * Math.abs(Math.sin(x * 3.1 + t * 1.7) * Math.sin(x * 0.9 - t * 0.6));
  const bolge = Math.sin(x * 38 + t * 14) * 0.6 + Math.sin(x * 91 - t * 23) * 0.4;
  return indhylling * bolge;
};

/** Opbygningens bolge: stoej der langsomt bliver til et signal. */
const stoejudsving = (x: number, t: number, andel: number): number => {
  const stoej = (Math.random() * 2 - 1) * (1 - andel * 0.6);
  return stoej * 0.7 + udsving(x, t) * andel;
};

export const lavIndkommendepanel = (
  vaert: HTMLElement,
  hentStatus: () => Klipstatus,
): Indkommendepanel => {
  const lampe = el('span', 'indkommende__lampe', '●');
  const overskriftTekst = el('span', undefined, 'INDKOMMENDE TRANSMISSION');
  const overskrift = el('div', 'indkommende__hoved');
  overskrift.append(lampe, overskriftTekst);

  const kilde = el('div', 'indkommende__linje');
  const kildeNavn = el('span', 'indkommende__vaerdi', '');
  kilde.append(el('span', 'felt', 'Kilde'), kildeNavn);

  const historik = el(
    'div',
    'indkommende__historik',
    `MODTAGET TIDLIGERE KL. ${OPTAGET_KL} — GENAFSPILNING`,
  );

  const bolge = el('canvas', 'indkommende__bolge');
  const meter = el('div', 'indkommende__meter', blokmeter(0, METERBREDDE));
  const tid = el('div', 'indkommende__tid', '00:00');

  // Samtalen har to parter, men kun den ene kan opfanges.
  const retning = el('div', 'indkommende__parter');
  const partEn = el('div', 'indkommende__part indkommende__part--hoeres');
  partEn.append(
    el('span', 'indkommende__prik', '●'),
    el('span', 'indkommende__partnavn', 'PART A · UDGÅENDE'),
    el('span', 'indkommende__partstatus', 'OPFANGET — KAN HØRES'),
  );
  const partTo = el('div', 'indkommende__part indkommende__part--tavs');
  partTo.append(
    el('span', 'indkommende__prik', '○'),
    el('span', 'indkommende__partnavn', 'PART B · INDGÅENDE'),
    el('span', 'indkommende__partstatus', 'INTET SIGNAL — KAN IKKE HØRES'),
  );
  retning.append(
    partEn,
    partTo,
    el(
      'p',
      'indkommende__note',
      'KUN ÉN PART AF SAMTALEN KAN OPFANGES. Svar fra den anden side høres ikke.',
    ),
  );
  const dekryptering = el('p', 'indkommende__dekryptering', 'DEKRYPTERING 100 %');
  const blokeret = el('p', 'indkommende__blokeret', 'LYD IKKE AKTIVERET PÅ DENNE SKÆRM');
  blokeret.hidden = true;

  vaert.append(overskrift, kilde, historik, bolge, meter, tid, retning, dekryptering, blokeret);

  const rolig = typeof matchMedia === 'function' && matchMedia(ROLIG).matches;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tegnBolge = (t: number, andel: number, opbygger: boolean): void => {
    const dpr = window.devicePixelRatio || 1;
    const b = Math.max(1, Math.floor(bolge.clientWidth * dpr));
    const h = Math.max(1, Math.floor(bolge.clientHeight * dpr));
    if (bolge.width !== b) bolge.width = b;
    if (bolge.height !== h) bolge.height = h;

    const c = bolge.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, b, h);

    c.strokeStyle = getComputedStyle(vaert).getPropertyValue('--fosfor').trim() || '#33ff6a';
    c.lineWidth = Math.max(1, h / 40);
    // Amplituden vokser med opbygningen, saa signalet traeder frem af stoejen.
    const styrke = opbygger ? 0.15 + 0.85 * andel * andel : 1;
    c.beginPath();
    for (let px = 0; px <= b; px += 2) {
      const x = px / b;
      const v = opbygger ? stoejudsving(x, t, andel) : udsving(x, t);
      const y = h / 2 + v * (h * 0.42) * styrke;
      if (px === 0) c.moveTo(px, y);
      else c.lineTo(px, y);
    }
    c.stroke();
  };

  const tegn = (): void => {
    const s = hentStatus();
    const opbygger = s.fase === 'opbygning';

    // Skaermens flimmer styres af to ting paa body: fasen og hvor langt den er.
    document.body.dataset['indkommende'] = opbygger ? 'opbygning' : 'ja';
    document.body.style.setProperty('--opbygning', opbygger ? s.opbygningAndel.toFixed(3) : '0');

    saetTekst(
      overskriftTekst,
      opbygger ? 'SIGNAL OPFANGET — FORBINDELSE ETABLERES' : 'INDKOMMENDE TRANSMISSION',
    );
    saetTekst(kildeNavn, opbygger ? 'SØGER ...' : s.titel);

    if (opbygger) {
      saetTekst(tid, `SYNKRONISERER ${String(Math.round(s.opbygningAndel * 100)).padStart(3, '0')} %`);
      saetTekst(meter, blokmeter(s.opbygningAndel * 100, METERBREDDE));
    } else {
      saetTekst(
        tid,
        s.varighedSek === null
          ? `${forloebet(s.forloebSek)} / --:--`
          : `${forloebet(s.forloebSek)} / ${forloebet(s.varighedSek)}`,
      );
      const andel = s.varighedSek ? (s.forloebSek / s.varighedSek) * 100 : 0;
      saetTekst(meter, blokmeter(andel, METERBREDDE));
    }

    retning.hidden = opbygger;
    dekryptering.hidden = opbygger;
    blokeret.hidden = !s.lydBlokeret || opbygger;
    vaert.dataset['fase'] = s.fase;
    tegnBolge(performance.now() / 1000, s.opbygningAndel, opbygger);
  };

  const stop = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.body.style.removeProperty('--opbygning');
  };

  return {
    opdater: (aktiv) => {
      vaert.hidden = !aktiv;
      if (!aktiv) {
        stop();
        return;
      }
      tegn();
      timer ??= setInterval(tegn, rolig ? RAMMER_ROLIG_MS : RAMMER_MS);
    },
  };
};
