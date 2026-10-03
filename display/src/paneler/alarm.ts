/**
 * Udrykningsfeltet.
 *
 * Det vigtigste panel paa skaermen. Naar det staar taendt, har fire unge
 * mennesker faa sekunder til at laese det, skrive noget af i moerke og komme
 * afsted - saa alt her er valgt efter, hvad man kan afkode paa tre meters
 * afstand med en lygte i haanden.
 *
 * Raekkefoelgen er den, de skal bruge den i:
 *   1. hvor langt og hvilken vej     -> faar dem op af stolen
 *   2. koordinatet                    -> skrives af
 *   3. naermeste kendte punkt         -> giver retningen et navn
 *   4. tid siden alarmen              -> til rapporten bagefter
 *
 * Panelet overtager hele instrumentsoejlen. Kurver og dekryptering skjules,
 * fordi ingen har brug for dem, naar alarmen er bekraeftet - og fordi pladsen
 * er det, der goer tallene store nok.
 */

import { forloebet, lokalTid } from '../format.js';
import { lavKoordinattab, SKABELON_LAT, SKABELON_LON } from '../koordinattab.js';
import { el, saetTekst } from './panel.js';
import type { Panel } from './panel.js';

/** Bygger et stort talfelt med sit feltnavn under. */
const stortFelt = (navn: string, klasse: string): { blok: HTMLElement; vaerdi: HTMLElement } => {
  const blok = el('div', `udryk__felt ${klasse}`);
  const vaerdi = el('div', 'udryk__tal', '—');
  blok.append(vaerdi, el('div', 'felt', navn));
  return { blok, vaerdi };
};

interface Felter {
  readonly titel: HTMLElement;
  readonly afstand: HTMLElement;
  readonly pejling: HTMLElement;
  readonly lat: HTMLElement;
  readonly lon: HTMLElement;
  readonly punktNavn: HTMLElement;
  readonly instruks: HTMLElement;
  readonly siden: HTMLElement;
  readonly fyret: HTMLElement;
  readonly kvitteret: HTMLElement;
}

const byg = (vaert: HTMLElement): Felter => {
  const titel = el('div', 'udryk__titel', 'Bekræftet aktivitet');

  const afstand = stortFelt('Afstand', 'udryk__felt--afstand');
  const pejling = stortFelt('Pejling', 'udryk__felt--pejling');
  const tal = el('div', 'udryk__talrække');
  tal.append(afstand.blok, pejling.blok);

  const koordinat = el('div', 'udryk__koordinat');
  const lat = el('div', 'udryk__ddm', '—');
  const lon = el('div', 'udryk__ddm', '—');
  koordinat.append(el('div', 'felt', 'Koordinat'), lat, lon);

  const punkt = el('div', 'udryk__punkt');
  const punktNavn = el('div', 'udryk__punktnavn', '—');
  punkt.append(el('div', 'felt', 'Nærmeste kendte punkt'), punktNavn);

  const instruks = el('div', 'udryk__instruks', '');

  const bund = el('div', 'udryk__bund');
  const siden = el('span', 'tal', '00:00');
  const fyret = el('span', 'tal', '--:--:--');
  const sidenFelt = el('span');
  sidenFelt.append(el('span', 'felt', 'Tid siden '), siden);
  const fyretFelt = el('span');
  fyretFelt.append(el('span', 'felt', 'Meldt '), fyret);
  bund.append(fyretFelt, sidenFelt);

  const kvitteret = el('div', 'udryk__kvitteret', 'Modtaget af vagthavende');

  vaert.append(titel, tal, koordinat, punkt, instruks, bund, kvitteret);

  return {
    titel,
    afstand: afstand.vaerdi,
    pejling: pejling.vaerdi,
    lat,
    lon,
    punktNavn,
    instruks,
    siden,
    fyret,
    kvitteret,
  };
};

export const lavAlarmpanel = (vaert: HTMLElement): Panel => {
  const f = byg(vaert);
  const koordinattab = lavKoordinattab([
    { felt: f.lat, skabelon: SKABELON_LAT },
    { felt: f.lon, skabelon: SKABELON_LON },
  ]);

  return {
    opdater: (s) => {
      const a = s.alarm;
      if (!a) return;

      saetTekst(f.titel, a.titel);
      saetTekst(f.afstand, `${a.afstandM} m`);
      // Pejlingen skrives med tre cifre, som paa et kompas: 060, ikke 60.
      saetTekst(f.pejling, `${String(a.pejlingGrader).padStart(3, '0')}°`);
      // Koordinatet kan vaere holdt tilbage af instruktoererne. Feltet bliver
      // staaende og joensker efter et fix, saa det ser ud som tabt signal - ikke
      // som om systemet aldrig havde et koordinat.
      //
      // Mens det er tabt, skriver koordinattab.ts i felterne mange gange i
      // sekundet. Derfor roerer vi dem ikke her; ellers ville de to skrive oven
      // i hinanden, og aflaesningen ville staa stille hvert sekund.
      const tabt = a.gradLat === null || a.gradLon === null;
      if (!tabt) {
        saetTekst(f.lat, a.gradLat ?? '—');
        saetTekst(f.lon, a.gradLon ?? '—');
      }
      f.lat.dataset['tabt'] = tabt ? 'ja' : 'nej';
      f.lon.dataset['tabt'] = tabt ? 'ja' : 'nej';
      koordinattab.saet(tabt);
      saetTekst(f.punktNavn, a.naermestePunkt);
      saetTekst(f.instruks, a.instruks);
      saetTekst(f.siden, forloebet(a.sekunderSiden));
      saetTekst(f.fyret, lokalTid(a.fyretKl));
      vaert.dataset['kvitteret'] = a.kvitteret ? 'ja' : 'nej';
      f.kvitteret.hidden = !a.kvitteret;
    },
  };
};
