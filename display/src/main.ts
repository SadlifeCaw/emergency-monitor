/**
 * Skaermens indgang.
 *
 * Holder forbindelsen og fordeler ét skaermbillede ud til panelerne. Der er
 * ingen logik her ud over det: alt regnestykke ligger paa serveren, og alt
 * tegnearbejde ligger i panelerne.
 *
 * Det vigtigste i filen er stadig genforbindelsen. Skaermen skal komme tilbage
 * af sig selv efter en server-genstart kl. 03, uden at nogen roerer et tastatur -
 * for der er hverken mus eller tastatur i lokalet.
 */

import 'leaflet/dist/leaflet.css';
import './style/tokens.css';
import './style/skaerm.css';
import './style/kort.css';
import './style/ravage.css';

import { lavGlitch } from './glitch.js';
import { lavKort } from './kort/kort.js';
import type { Kort } from './kort/kort.js';
import { lavLyd } from './lyd.js';
import { lydbeslutning, tomLydtilstand } from './lydbeslutning.js';
import type { Lydtilstand } from './lydbeslutning.js';
import { lavAlarmpanel } from './paneler/alarm.js';
import { lavDekrypteringspanel } from './paneler/dekryptering.js';
import { lavHovedpanel, visForbindelse } from './paneler/hoved.js';
import { lavKortskala } from './paneler/kortskala.js';
import { lavKurvepanel } from './paneler/kurver.js';
import { lavLogpanel } from './paneler/log.js';
import { lavStatuspanel } from './paneler/status.js';
import type { Panel } from './paneler/panel.js';
import type { Skaermbillede } from './kontrakt.js';

const GENFORBIND_START_MS = 250;
const GENFORBIND_LOFT_MS = 5000;

/** Husker paa tvaers af genindlaesninger, at nogen har armeret lyden. */
const ARMERET_NOEGLE = 'natvagt.armeret';

const felt = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Skaermen mangler elementet #${id}`);
  return e;
};

const hovedvaert = felt('hoved');
const kortvaert = felt('kort');
const sweepvaert = felt('sweep') as HTMLCanvasElement;

const paneler: Panel[] = [
  lavHovedpanel(hovedvaert),
  lavKurvepanel(felt('kurver')),
  lavDekrypteringspanel(felt('dekryptering')),
  lavStatuspanel(felt('status')),
  lavAlarmpanel(felt('udryk')),
  lavLogpanel(felt('log')),
];

const skala = lavKortskala(felt('kortskala'));

const lyd = lavLyd();
const glitch = lavGlitch(document.body);
const armerknap = felt('armer') as HTMLButtonElement;

let kort: Kort | null = null;
let harBasiskort = true;
let ventetid = GENFORBIND_START_MS;
let lydtilstand: Lydtilstand = tomLydtilstand();

/**
 * Armering af lyden.
 *
 * Browseren afspiller ikke noget, foer nogen har roert siden. Bjaelken siger
 * det hoejt ved opsaetningen og forsvinder derefter. I kiosk-drift starter
 * Chrome med --autoplay-policy=no-user-gesture-required, saa en genstart kl. 03
 * ikke efterlader en tavs skaerm - se scripts/start-natvagt.ps1 i fase 7.
 */
const armer = async (): Promise<void> => {
  if (await lyd.armer()) {
    armerknap.hidden = true;
    try {
      localStorage.setItem(ARMERET_NOEGLE, 'ja');
    } catch {
      // Privat browsertilstand. Bjaelken kommer bare igen naeste gang.
    }
  }
};

armerknap.addEventListener('click', () => void armer());

// Har nogen armeret tidligere paa denne maskine, proever vi stille igen - det
// lykkes, hvis Chrome er startet med autoplay slaaet til.
try {
  if (localStorage.getItem(ARMERET_NOEGLE) === 'ja') void armer();
} catch {
  // Ingen adgang til localStorage; bjaelken staar bare fremme.
}

/**
 * Er det lokale kort til stede?
 *
 * Uden det tegner Leaflet en tom, sort flade, og skaermen ser ud som om den
 * virker. Findes filen ikke, tegnes et noedgitter i stedet, og status siger det
 * hoejt - se kort/overlays.ts.
 */
const tjekKortfil = async (): Promise<void> => {
  try {
    harBasiskort = (await fetch('/kort/vork.pmtiles', { method: 'HEAD' })).ok;
  } catch {
    harBasiskort = false;
  }
};

/** Oversaetter skaermbilledet til lyd. Beslutningen ligger i lydbeslutning.ts. */
const opdaterLyd = (s: Skaermbillede): void => {
  const resultat = lydbeslutning(lydtilstand, {
    alarmId: s.alarm?.haendelseId ?? null,
    kvitteret: s.alarm?.kvitteret ?? false,
    anomaliIder: s.anomalier.map((a) => a.id),
  });
  lydtilstand = resultat.tilstand;

  for (const handling of resultat.handlinger) {
    if (handling === 'START_SIRENE') lyd.sirene();
    if (handling === 'STOP_SIRENE') lyd.tavs();
    if (handling === 'BLIP') lyd.blip();
  }
};

const vis = (s: Skaermbillede): void => {
  // Fasen saettes paa body, saa alarmen kan overtage layoutet uden at hvert
  // panel skal kende til den.
  document.body.dataset['fase'] = s.fase;
  document.body.dataset['kvitteret'] = s.alarm?.kvitteret ? 'ja' : 'nej';

  // Instruktoerernes forstyrrelser. Sloeringen og koordinatet er ren CSS;
  // glitchen har sin egen rytme og styres derfor af et modul.
  document.body.dataset['sloeret'] = s.ravage.sloeretKort ? 'ja' : 'nej';
  glitch.saet(s.ravage.glitch);

  kort ??= lavKort(kortvaert, sweepvaert, { harBasiskort });
  kort.opdater(s);
  skala.opdater(kort.meterPrPixel());

  for (const panel of paneler) panel.opdater(s);
  opdaterLyd(s);
};

const wsAdresse = (): string =>
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;

const forbind = (): void => {
  const ws = new WebSocket(wsAdresse());

  ws.addEventListener('open', () => {
    ventetid = GENFORBIND_START_MS;
    visForbindelse(hovedvaert, false, 'Forbundet');
  });

  ws.addEventListener('message', (h: MessageEvent<string>) => {
    try {
      vis(JSON.parse(h.data) as Skaermbillede);
    } catch {
      // En enkelt uforstaaelig besked maa ikke tage skaermen ned.
    }
  });

  ws.addEventListener('close', () => {
    visForbindelse(hovedvaert, true, 'Forbindelse tabt — genforbinder');
    // Eksponentiel backoff med loft: hurtigt tilbage, men uden at hamre paa
    // en server der er nede.
    setTimeout(forbind, ventetid);
    ventetid = Math.min(ventetid * 2, GENFORBIND_LOFT_MS);
  });

  ws.addEventListener('error', () => ws.close());
};

// Kortdata tjekkes foer forbindelsen, saa det foerste skaermbillede allerede
// ved, om der skal tegnes basiskort eller noedgitter.
void tjekKortfil().finally(forbind);
