/**
 * Styringen.
 *
 * En fjernbetjening, ikke et dashboard. Den bruges i fem til tyve sekunder ad
 * gangen, med én hånd, i mørke - og mens man står blandt deltagere, der ikke
 * må se hvad der sker.
 *
 * Det sidste er den begrænsning, der styrer mest: alarmtilstanden markeres med
 * form og placering, aldrig med en stor lys flade. Se style.css.
 *
 * Nedtællingen løber lokalt mellem opdateringerne, så tallene er bløde uden at
 * telefonen skal spørge serveren hvert sekund.
 */

import './style.css';
import { glemToken, gemToken, hentToken, kald } from './api.js';
// Genbrugt fra skærmen frem for skrevet af. Formateringen løser en konkret
// fælde - da-DK sætter punktum mellem timer og minutter, hvilket kan forveksles
// med decimaltallene - og den slags rettelse må ikke findes i to udgaver.
import { lokalTid } from '../../display/src/format.js';
import { lavAlarmpanel } from './alarmpanel.js';
import { lavLangtryk } from './langtryk.js';
import { lavRavagepanel } from './ravagepanel.js';
import type { Adminoversigt, HaendelseIOversigt } from './typer.js';

/** Hvor ofte overblikket hentes. Nedtællingen tikker lokalt imellem. */
const HENT_MS = 4000;

const felt = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Mangler #${id}`);
  return e;
};

const el = (navn: string, klasse: string, tekst: string): HTMLElement => {
  const e = document.createElement(navn);
  e.className = klasse;
  e.textContent = tekst;
  return e;
};

const statbjaelke = felt('stat');
const tilstandsfelt = felt('tilstand');
const notefelt = felt('note');
const urfelt = felt('ur');
const meldingfelt = felt('melding');
const grebfelt = felt('handlinger');
const listefelt = felt('haendelser');
const login = felt('login') as HTMLDialogElement;

let oversigt: Adminoversigt | null = null;
/** Forskellen mellem serverens ur og telefonens, så nedtællingen er serverens. */
let urforskel = 0;

const serverNu = (): number => Date.now() + urforskel;

const nedtaelling = (sekunder: number): string => {
  const s = Math.abs(Math.round(sekunder));
  const t = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${sekunder < 0 ? '-' : ''}${t > 0 ? `${t}:` : ''}${mmss}`;
};

const visMelding = (tekst: string, slags: 'fejl' | 'ok'): void => {
  meldingfelt.textContent = tekst;
  meldingfelt.dataset['slags'] = slags;
  meldingfelt.hidden = false;
  window.setTimeout(() => {
    meldingfelt.hidden = true;
  }, 9000);
};

/** Kører en kommando og bruger svaret som det nye overblik. */
const kommando = async (sti: string, metode: 'POST' | 'PATCH' | 'DELETE', krop?: unknown) => {
  const svar = await kald<Adminoversigt>(sti, metode, krop);
  if (!svar.ok) {
    if (svar.ugyldigtToken) {
      glemToken();
      login.showModal();
    }
    visMelding(svar.fejl, 'fejl');
    return false;
  }
  saetOversigt(svar.data);
  return true;
};

const alarmpanel = lavAlarmpanel(felt('alarmpanel'), {
  opret: (alarm) => kommando('../api/admin/haendelse', 'POST', alarm),
  gem: (id, aendringer) => kommando(`../api/admin/haendelse/${id}`, 'PATCH', aendringer),
  meld: (tekst) => visMelding(tekst, 'ok'),
  serverNu: () => serverNu(),
});

const ravagepanel = lavRavagepanel(felt('ravage'), {
  saet: (aendringer) => kommando('../api/admin/ravage', 'POST', aendringer),
});

const saetOversigt = (ny: Adminoversigt): void => {
  oversigt = ny;
  urforskel = Date.parse(ny.serverKl) - Date.now();
  tegn();
};

const hent = async (): Promise<void> => {
  const svar = await kald<Adminoversigt>('../api/admin/oversigt');
  if (!svar.ok) {
    if (svar.ugyldigtToken) login.showModal();
    else notefelt.textContent = svar.fejl;
    return;
  }
  saetOversigt(svar.data);
};

// ---------------------------------------------------------------- taster

const hovedtast = (
  navn: string,
  klasse: string,
  handling: () => void,
  langt: boolean,
): HTMLButtonElement => {
  const b = document.createElement('button');
  b.className = `hovedtast ${klasse}`;
  b.type = 'button';
  b.append(el('span', 'hovedtast__navn', navn));

  if (langt) {
    b.append(el('span', 'hovedtast__hold', 'hold inde'));
    lavLangtryk({ knap: b, udfoer: handling });
  } else {
    b.addEventListener('click', handling);
  }
  return b;
};

/**
 * Grebet i bunden.
 *
 * Indholdet skifter med tilstanden, men pladsen gør ikke: den store handling
 * ligger altid nederst, hvor tommelfingeren er.
 */
const tegnGreb = (o: Adminoversigt): void => {
  grebfelt.replaceChildren();
  grebfelt.classList.toggle('greb--to', o.aktivAlarm !== null);

  if (o.aktivAlarm) {
    grebfelt.append(
      hovedtast(
        o.aktivAlarm.kvitteretKl ? 'Kvitteret' : 'Kvittér',
        'hovedtast--rolig hovedtast--lav',
        () => void kommando('../api/admin/kvitter', 'POST'),
        false,
      ),
      hovedtast(
        'Stop alarm',
        'hovedtast--rav hovedtast--lav',
        () => void kommando('../api/admin/stop', 'POST'),
        true,
      ),
    );
    return;
  }

  const venter = o.haendelser.find((h) => h.type === 'ALARM' && h.kanFyres);
  if (venter) {
    grebfelt.append(
      hovedtast('Fyr alarm', '', () => void kommando(`../api/admin/fyr/${venter.id}`, 'POST'), true),
    );
    return;
  }

  grebfelt.append(el('p', 'tom', 'Ingen alarm klar. Sæt tid og koordinat ovenfor, og opret den.'));
};

const TILSTAND: Record<string, string> = {
  ROLIG: 'Overvågning',
  OPTRAPNING: 'Forhøjet aktivitet',
  ALARM: 'Alarm udløst',
  AFSLUTTET: 'Afsluttet',
};

const noten = (o: Adminoversigt): string => {
  if (o.aktivAlarm) {
    const siden = nedtaelling((serverNu() - Date.parse(o.aktivAlarm.fyretKl)) / 1000);
    return o.aktivAlarm.kvitteretKl ? `Kvitteret · ${siden}` : `Udløst for ${siden} siden`;
  }
  if (o.naeste) {
    return `Næste om ${nedtaelling((Date.parse(o.naeste.at) - serverNu()) / 1000)}`;
  }
  return 'Ingen alarm klar';
};

const tegnPost = (h: HaendelseIOversigt): HTMLElement => {
  const raekke = document.createElement('article');
  raekke.className = 'post';
  raekke.append(
    el('span', 'post__kl', lokalTid(h.at, 'Europe/Copenhagen', false)),
    el('span', 'post__navn', h.punkt ? `${h.punkt.afstandM} m · sektor ${h.punkt.sektor}` : h.titel),
    el('span', 'post__status', h.kanFyres ? nedtaelling(h.sekunderTil) : h.status),
  );
  return raekke;
};

const tegn = (): void => {
  const o = oversigt;
  if (!o) return;

  urfelt.textContent = lokalTid(new Date(serverNu()).toISOString());
  statbjaelke.dataset['fase'] = o.fase;
  tilstandsfelt.textContent = TILSTAND[o.fase] ?? o.fase;
  notefelt.textContent = noten(o);

  alarmpanel.opdater(o);
  ravagepanel.opdater(o);
  tegnGreb(o);

  listefelt.replaceChildren(
    ...(o.haendelser.length
      ? o.haendelser.map(tegnPost)
      : [el('p', 'tom', 'Ingen endnu.')]),
  );
};

// ---------------------------------------------------------------- opstart

felt('tokengem').addEventListener('click', () => {
  const vaerdi = (felt('tokenfelt') as HTMLInputElement).value.trim();
  if (vaerdi) {
    gemToken(vaerdi);
    void hent();
  }
});

if (!hentToken()) login.showModal();

void hent();
window.setInterval(() => void hent(), HENT_MS);
// Uret og nedtællingerne løber lokalt, så de er bløde mellem opdateringerne.
window.setInterval(tegn, 1000);
