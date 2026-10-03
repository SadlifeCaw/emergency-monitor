/**
 * Alarmpanelet: nattens ene alarm, sat op ét sted.
 *
 * Monitoren koerer hele ugen, og alarmen er det eneste, instruktoererne selv
 * bestemmer - anomalier og dekryptering genereres af uret. Panelet er derfor
 * hele admin-fladens indhold ud over de tre store knapper.
 *
 * Det kan begge dele: rette den alarm der venter, og oprette en ny naar den
 * forrige er brugt. Samme felter til begge, for at rette en alarm er at
 * oprette den igen med de samme oplysninger.
 *
 * Feltet regner afstand, pejling og sektor ud, mens der tastes - med de samme
 * funktioner som serveren og skaermen bruger. Det er panelets vigtigste
 * egenskab: et taste-slip i et koordinat ser ud som et gyldigt koordinat, men
 * "9753 m - uden for omraadet" opdages med det samme.
 */

// Geometrien genbruges fra motoren frem for at blive skrevet af. Modulet er ren
// TypeScript uden afhaengigheder, saa det bundles ind uden videre - og en
// afstand udregnet paa telefonen skal give det samme som paa skaermen.
import { afstandM, formaterDdm, pejlingGrader, sektorFor } from '../../server/src/motor/geo.js';
import { AdresseFejl, soegAdresse } from './adresse.js';
import type { Adressetraef } from './adresse.js';
import type { Adminoversigt, HaendelseIOversigt } from './typer.js';

/** Vaerdier en ny alarm faar, som ikke er vaerd at taste paa en telefon. */
const STANDARD = {
  titel: 'BEKRAEFTET AKTIVITET',
  usikkerhedM: 40,
  optrapningSek: 300,
  lyd: 'sirene',
} as const;

export interface Alarmpanel {
  opdater(oversigt: Adminoversigt): void;
}

export interface Alarmpanelafhaengigheder {
  readonly opret: (alarm: Record<string, unknown>) => Promise<boolean>;
  readonly gem: (id: string, aendringer: Record<string, unknown>) => Promise<boolean>;
  /**
   * Kvitterer for en gemt aendring.
   *
   * Gaar til fladens faelles meldingsbjaelke og ikke til panelets egen linje:
   * den linje viser afstanden og bliver skrevet om ved naeste opdatering.
   */
  readonly meld: (tekst: string) => void;
  /**
   * Serverens ur - ikke telefonens.
   *
   * De to kan ligge langt fra hinanden: telefonens ur kan vaere sat forkert,
   * og under en generalproeve loeber serverens ur mange gange hurtigere. Et
   * tidspunkt regnet ud fra telefonen ville saa ligge i fortiden, og alarmen
   * ville fyre i samme sekund den blev oprettet.
   */
  readonly serverNu: () => number;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  navn: K,
  klasse?: string,
  tekst?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(navn);
  if (klasse) e.className = klasse;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};

const tilLokaltFelt = (ms: number): string => {
  const d = new Date(ms);
  const to = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${to(d.getMonth() + 1)}-${to(d.getDate())}T${to(d.getHours())}:${to(d.getMinutes())}`;
};

const felt = (id: string, slags: 'text' | 'decimal' | 'datetime-local'): HTMLInputElement => {
  const input = el('input', 'vaerdifelt');
  input.type = slags === 'datetime-local' ? 'datetime-local' : 'text';
  input.id = id;
  input.autocomplete = 'off';
  if (slags === 'decimal') input.inputMode = 'decimal';
  return input;
};

const medMaerkat = (maerkat: string, input: HTMLElement): HTMLElement => {
  const blok = el('label', 'felt');
  blok.append(el('span', 'legende', maerkat), input);
  return blok;
};

interface Felter {
  readonly overskrift: HTMLElement;
  readonly adresse: HTMLInputElement;
  readonly findknap: HTMLButtonElement;
  readonly traef: HTMLElement;
  readonly tid: HTMLInputElement;
  readonly lat: HTMLInputElement;
  readonly lon: HTMLInputElement;
  readonly punkt: HTMLInputElement;
  readonly instruks: HTMLInputElement;
  readonly kvittering: HTMLElement;
  readonly gemknap: HTMLButtonElement;
}

const byg = (vaert: HTMLElement): Felter => {
  const overskrift = el('h2', 'legende', 'Nattens alarm');

  const tid = felt('alarmtid', 'datetime-local');
  const lat = felt('alarmlat', 'decimal');
  const lon = felt('alarmlon', 'decimal');
  const punkt = felt('alarmpunkt', 'text');
  const instruks = felt('alarminstruks', 'text');

  const adresse = felt('alarmadresse', 'text');
  adresse.placeholder = 'fx Vork Bakker 12, Vejle';
  const findknap = el('button', 'tast tast--lille', 'Find');
  findknap.type = 'button';
  const adresseraekke = el('div', 'adresseraekke');
  adresseraekke.append(medMaerkat('Adresse eller sted (valgfri)', adresse), findknap);
  const traef = el('div', 'traef');

  const koordinater = el('div', 'par');
  koordinater.append(medMaerkat('Bredde (lat)', lat), medMaerkat('Længde (lon)', lon));

  const kvittering = el('p', 'aflaesning', '');
  const gemknap = el('button', 'tast', 'Gem ændringer');
  gemknap.type = 'button';

  vaert.append(
    overskrift,
    medMaerkat('Tidspunkt', tid),
    adresseraekke,
    traef,
    koordinater,
    kvittering,
    medMaerkat('Nærmeste kendte punkt', punkt),
    medMaerkat('Instruks på skærmen', instruks),
    gemknap,
  );

  return { overskrift, adresse, findknap, traef, tid, lat, lon, punkt, instruks, kvittering, gemknap };
};

interface Graenser {
  readonly base: { readonly lat: number; readonly lon: number };
  readonly maxRadiusM: number;
  readonly sektorer: number;
}

const tal = (input: HTMLInputElement): number => Number(input.value.replace(',', '.'));

const sig = (kvittering: HTMLElement, tekst: string, slags: 'ok' | 'fejl'): boolean => {
  kvittering.textContent = tekst;
  kvittering.dataset['slags'] = slags;
  return slags === 'ok';
};

/**
 * Regner koordinatet igennem og siger, om det kan bruges.
 * Samme graense som serverens, saa svaret her aldrig modsiger svaret derfra.
 */
const efterproev = (
  f: Felter,
  { base, maxRadiusM, sektorer }: Graenser,
  serverNu: () => number,
): boolean => {
  const punkt = { lat: tal(f.lat), lon: tal(f.lon) };

  if (!Number.isFinite(punkt.lat) || !Number.isFinite(punkt.lon)) {
    return sig(f.kvittering, 'Koordinatet er ikke et tal.', 'fejl');
  }

  const afstand = Math.round(afstandM(base, punkt));
  if (afstand > maxRadiusM) {
    return sig(f.kvittering, `${afstand} m fra basen — uden for området på ${maxRadiusM} m.`, 'fejl');
  }

  const pejling = pejlingGrader(base, punkt);
  const linje = `${afstand} m · ${String(Math.round(pejling) % 360).padStart(3, '0')}° · sektor ${sektorFor(pejling, sektorer)} · ${formaterDdm(punkt)}`;

  // Et tidspunkt der allerede er passeret fyrer med det samme. Det er en
  // gyldig maade at gøre det paa - men man skal vide det, foer man trykker.
  const naar = Date.parse(f.tid.value);
  if (Number.isFinite(naar) && naar <= serverNu()) {
    return sig(f.kvittering, `${linje}
Tidspunktet er passeret — alarmen fyrer straks.`, 'ok');
  }

  return sig(f.kvittering, linje, 'ok');
};

export const lavAlarmpanel = (
  vaert: HTMLElement,
  { opret, gem, meld, serverNu }: Alarmpanelafhaengigheder,
): Alarmpanel => {
  const f = byg(vaert);
  const { tid, lat, lon, punkt, instruks, gemknap } = f;

  /** Den alarm der venter, eller null naar der skal oprettes en ny. */
  let venter: HaendelseIOversigt | null = null;
  let graenser: Graenser = { base: { lat: 0, lon: 0 }, maxRadiusM: 0, sektorer: 8 };
  let redigerer = false;

  for (const input of [tid, lat, lon, punkt, instruks]) {
    input.addEventListener('input', () => {
      redigerer = true;
      if (input !== punkt && input !== instruks) efterproev(f, graenser, serverNu);
    });
  }

  const vaelgTraef = (t: Adressetraef): void => {
    lat.value = t.lat.toFixed(6);
    lon.value = t.lon.toFixed(6);
    f.traef.replaceChildren();
    redigerer = true;
    efterproev(f, graenser, serverNu);
  };

  const find = async (): Promise<void> => {
    f.traef.replaceChildren();
    f.findknap.disabled = true;
    try {
      const fundet = await soegAdresse(f.adresse.value, graenser.base, (url) => fetch(url));
      if (fundet.length === 0) {
        f.traef.append(el('p', 'aflaesning', 'Ingen resultater. Prøv en anden stavemåde.'));
      }
      for (const t of fundet) {
        const knap = el('button', 'tast tast--lille tast--traef', t.navn);
        knap.type = 'button';
        knap.addEventListener('click', () => vaelgTraef(t));
        f.traef.append(knap);
      }
    } catch (fejl) {
      const tekst = fejl instanceof AdresseFejl ? fejl.message : 'Opslaget fejlede.';
      f.traef.append(el('p', 'aflaesning', tekst));
    } finally {
      f.findknap.disabled = false;
    }
  };

  f.findknap.addEventListener('click', () => void find());
  f.adresse.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void find();
  });

  gemknap.addEventListener('click', () => {
    if (!efterproev(f, graenser, serverNu)) return;

    const vaerdier = {
      at: new Date(tid.value).toISOString(),
      lat: tal(lat),
      lon: tal(lon),
      naermestePunkt: punkt.value.trim() || 'IKKE ANGIVET',
      instruks: instruks.value.trim() || 'UDRYK STRAKS',
    };

    // Laeses foer kaldet: svaret opdaterer oversigten, og dermed `venter`,
    // inden loeftet er afviklet. Uden det ville en oprettelse kvittere med
    // "gemt", fordi alarmen naaede at findes.
    const varNy = venter === null;

    void (venter
      ? gem(venter.id, vaerdier)
      : opret({ ...STANDARD, ...vaerdier, id: `alarm-${Date.now().toString(36)}`, type: 'ALARM' })
    ).then((ok) => {
      if (!ok) return;
      redigerer = false;
      meld(varNy ? 'Alarmen er oprettet og venter.' : 'Alarmen er gemt.');
    });
  });

  /** Fylder felterne med den ventende alarm - eller med et brugbart udgangspunkt. */
  const fyldFelter = (o: Adminoversigt): void => {
    if (redigerer) return;

    if (venter) {
      tid.value = tilLokaltFelt(Date.parse(venter.at));
      lat.value = String(venter.punkt?.lat ?? '');
      lon.value = String(venter.punkt?.lon ?? '');
      punkt.value = String(venter.felter['naermestePunkt'] ?? '');
      instruks.value = String(venter.felter['instruks'] ?? '');
    } else {
      // Ny alarm: en time frem paa serverens ur, med basens koordinat som
      // udgangspunkt. Saa er der noget at rette i frem for tomme felter.
      tid.value = tilLokaltFelt(serverNu() + 60 * 60_000);
      lat.value = String(o.base.lat);
      lon.value = String(o.base.lon);
      punkt.value = '';
      instruks.value = 'UDRYK STRAKS';
    }
    efterproev(f, graenser, serverNu);
  };

  return {
    opdater: (o) => {
      graenser = {
        base: { lat: o.base.lat, lon: o.base.lon },
        maxRadiusM: o.kort.maxRadiusM,
        sektorer: o.kort.sektorer,
      };
      venter = o.haendelser.find((h) => h.type === 'ALARM' && h.kanFyres) ?? null;

      f.overskrift.textContent = venter ? 'Alarmen der venter' : 'Opret en alarm';
      gemknap.textContent = venter ? 'Gem ændringer' : 'Opret alarm';
      vaert.hidden = false;

      fyldFelter(o);
    },
  };
};
