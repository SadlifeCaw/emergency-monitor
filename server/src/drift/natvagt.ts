/**
 * Natvagten: den koerende sammenkobling af motor, lager og udsending.
 *
 * Ét tick i sekundet. Motoren regner, lageret skriver kun naar noget faktisk
 * skete, og skaermbilledet sendes ud hver gang, saa uret paa skaermen loeber.
 *
 * Admin-kommandoer fra telefonen gaar gennem den samme koe som tick-loopet.
 * Det er ikke pedanteri: `skridt()` venter paa at tilstanden er skrevet til
 * disken, og en kommando, der lander i den ventetid, ville kunne laese en
 * foraeldet tilstand og faa sin egen skrivning overskrevet. Det ville vise sig
 * som "jeg trykkede FYR, og der skete ingenting" kl. 02.14.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gemJson, laesJson, sletJson } from '../lager/jsonlager.js';
import { gemTilstand, laesTilstand, sletTilstand } from '../lager/tilstandslager.js';
import { ScenarieFejl, laesScenarie } from '../motor/scenarie.js';
import { fjernHaendelse, retHaendelse, tilfoejHaendelse } from '../motor/scenarieaendring.js';
import { aflaes, genererLoglinje } from '../motor/telemetri.js';
import type { Loglinje, Sensoraflaesning } from '../motor/telemetri.js';
import { fyrNu, kvitter, nyTilstand, stop, tick } from '../motor/motor.js';
import { saetRavage } from '../motor/ravage.js';
import type { Ravageaendring } from '../motor/ravage.js';
import type { Scenarie, Tilstand } from '../motor/typer.js';
import { komprimeretUr, systemUr } from '../motor/ur.js';
import type { Ur } from '../motor/ur.js';
import type { Konfig } from '../konfig.js';
import { bygSkaermbillede } from './skaermbillede.js';
import type { Sensorhistorik, Skaermbillede } from './skaermbillede.js';

const TICK_MS = 1000;

/**
 * Hvor mange sekunder kurveskriverne husker.
 *
 * 300 er valgt, fordi optrapningen mod alarmen varer 300 sekunder: naar alarmen
 * falder, fylder hele rampen praecis grafens bredde. Et vagthold, der kigger paa
 * kurven, kan altsaa se hele opbygningen paa én gang.
 */
const HISTORIK_SEKUNDER = 300;

export interface Natvagt {
  /** Det scenarie der koeres efter lige nu - inkl. admins aendringer. */
  scenarie(): Scenarie;
  tilstand(): Tilstand;
  skaermbillede(): Skaermbillede;
  /** Koerer ét tick. Kaldes af intervallet - og direkte fra test. */
  skridt(): Promise<void>;
  start(): void;
  stands(): void;

  // --- admin. Alle koerer serialiseret med tick-loopet. ---
  fyrHaendelse(id: string): Promise<void>;
  kvitterAlarm(): Promise<void>;
  stopAlarm(): Promise<void>;
  nulstilNatten(): Promise<void>;
  opretHaendelse(ny: unknown): Promise<void>;
  retHaendelsen(id: string, aendringer: Record<string, unknown>): Promise<void>;
  aflysHaendelse(id: string): Promise<void>;
  /** Slaar instruktoerernes forstyrrelser til og fra. */
  saetRavagen(aendringer: Ravageaendring): Promise<void>;
}

export interface Natvagtafhaengigheder {
  readonly konfig: Konfig;
  /** Kaldes med skaermbilledet ved hvert tick og efter hver kommando. */
  readonly udsend: (skaermbillede: Skaermbillede) => void;
  /** Kaldes ved uventede fejl i loopet, saa de kan logges uden at vaelte natten. */
  readonly paaFejl?: (fejl: unknown) => void;
  /** Overstyrer uret. Bruges af integrationstesten til at afspille hele natten. */
  readonly ur?: Ur;
}

interface Loopstyring {
  start(): void;
  stands(): void;
}

/**
 * Intervallet der driver natten frem. Holdt for sig, fordi den eneste regel her
 * er den vigtigste: en fejl i ét skridt maa aldrig standse de foelgende.
 */
const lavLoop = (skridt: () => Promise<void>, paaFejl?: (fejl: unknown) => void): Loopstyring => {
  let interval: NodeJS.Timeout | null = null;

  return {
    start: () => {
      if (interval) return;
      interval = setInterval(() => {
        skridt().catch((fejl: unknown) => paaFejl?.(fejl));
      }, TICK_MS);
      interval.unref?.();
    },
    stands: () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    },
  };
};

/**
 * Ringbuffer med fast loft. Uden loftet vokser baade log og historik i seks
 * timer, og skaermen bliver langsommere praecis naar den skal vaere hurtigst.
 */
const tilfoej = <T>(raekke: readonly T[], element: T, loft: number): T[] => {
  const naeste = [...raekke, element];
  return naeste.length > loft ? naeste.slice(naeste.length - loft) : naeste;
};

const tomHistorik = (): Sensorhistorik => ({ seismik: [], emf: [], temperatur: [] });

const tilfoejMaaling = (historik: Sensorhistorik, maaling: Sensoraflaesning): Sensorhistorik => ({
  seismik: tilfoej(historik.seismik, maaling.seismik, HISTORIK_SEKUNDER),
  emf: tilfoej(historik.emf, maaling.emf, HISTORIK_SEKUNDER),
  temperatur: tilfoej(historik.temperatur, maaling.temperatur, HISTORIK_SEKUNDER),
});

/** Det loebende materiale, ét tick aendrer paa. */
interface Arbejde {
  readonly tilstand: Tilstand;
  readonly log: readonly Loglinje[];
  readonly historik: Sensorhistorik;
}

/**
 * Ét skridt frem, som ren funktion.
 *
 * Skilt fra selve loopet, saa det der faktisk sker i et tick kan laeses uden at
 * skulle igennem koe, lager og udsending foerst.
 */
const beregnSkridt = (
  scenarie: Scenarie,
  arbejde: Arbejde,
  logloft: number,
  nu: number,
): { readonly arbejde: Arbejde; readonly skalGemmes: boolean } => {
  const resultat = tick(scenarie, arbejde.tilstand, nu);
  const linje = genererLoglinje(scenarie, resultat.tilstand, nu);

  return {
    arbejde: {
      tilstand: resultat.tilstand,
      log: linje ? tilfoej(arbejde.log, linje, logloft) : arbejde.log,
      historik: tilfoejMaaling(arbejde.historik, aflaes(scenarie, resultat.tilstand, nu)),
    },
    // Skriv kun til disk naar noget faktisk skete. En skrivning i sekundet i
    // seks timer er baade unoedvendig og en risiko i sig selv.
    skalGemmes: resultat.udgaaende.length > 0,
  };
};

/** Fjerner sporet af en haendelse fra koerselstilstanden. */
const udenSpor = (tilstand: Tilstand, id: string): Tilstand => {
  const { [id]: _fyret, ...fyrede } = tilstand.fyrede;
  const { [id]: _tvunget, ...tvungne } = tilstand.tvungne;
  return { ...tilstand, fyrede, tvungne };
};

const lavUr = (konfig: Konfig): Ur => {
  // Et virtuelt starttidspunkt er nyttigt ogsaa i realtid: saa kan man saette
  // natten i gang lige foer alarmen og se den falde uden at vente i tre timer.
  if (konfig.hastighed === 1 && konfig.virtuelStart === null) return systemUr();
  return komprimeretUr({
    kilde: systemUr(),
    virtuelStart: konfig.virtuelStart ?? Date.now(),
    hastighed: konfig.hastighed,
  });
};

/**
 * Hvor admins rettede scenarie ligger.
 *
 * `scenarios/nat.json` er planen og roeres aldrig. Aendringer fra telefonen
 * gemmes ved siden af koerselstilstanden, saa de overlever en genstart - og saa
 * "nulstil natten" bringer alt tilbage til planen ved at slette to filer.
 */
const scenariesti = (konfig: Konfig): string => join(dirname(konfig.tilstandssti), 'scenarie.json');

const laesPlan = async (sti: string): Promise<Scenarie> =>
  laesScenarie(JSON.parse(await readFile(sti, 'utf8')));


export const startNatvagt = async ({
  konfig,
  udsend,
  paaFejl,
  ur: overstyretUr,
}: Natvagtafhaengigheder): Promise<Natvagt> => {
  const arbejdssti = scenariesti(konfig);

  // Har admin rettet noget, koerer vi videre paa det. Ellers paa planen.
  // Har natten allerede vaeret i gang, koeres der videre paa de tidspunkter,
  // der blev trukket dengang. Ellers trakkes en ny nat, og den gemmes.
  // Har admin rettet noget, koeres der videre paa det. Ellers paa planen.
  let scenarie =
    (await laesJson(arbejdssti, (raa) => laesScenarie(raa), 'scenarie')) ??
    (await laesPlan(konfig.scenariesti));

  const ur = overstyretUr ?? lavUr(konfig);

  // Genoptag natten, hvis der ligger en gemt tilstand. Ellers begynd forfra.
  let arbejde: Arbejde = {
    tilstand: (await laesTilstand(konfig.tilstandssti)) ?? nyTilstand(scenarie, ur.naa()),
    log: [],
    historik: tomHistorik(),
  };

  /**
   * Alt der aendrer tilstand eller scenarie gaar herigennem, ét ad gangen.
   * En fejl i én kommando maa ikke braekke koeen for de naeste.
   */
  let koe: Promise<unknown> = Promise.resolve();
  const iKoe = <T>(handling: () => Promise<T>): Promise<T> => {
    const resultat = koe.then(handling, handling);
    koe = resultat.then(
      () => undefined,
      () => undefined,
    );
    return resultat;
  };

  const skaermbillede = (): Skaermbillede =>
    bygSkaermbillede(scenarie, arbejde.tilstand, arbejde, ur.naa());

  const gem = (): Promise<void> => gemTilstand(konfig.tilstandssti, arbejde.tilstand);

  const udfoerSkridt = async (): Promise<void> => {
    const resultat = beregnSkridt(scenarie, arbejde, konfig.logloft, ur.naa());
    arbejde = resultat.arbejde;
    if (resultat.skalGemmes) await gem();
    udsend(skaermbillede());
  };

  /** Anvender en tilstandsaendring fra motoren, gemmer og sender ud. */
  const anvend = async (resultat: { tilstand: Tilstand }): Promise<void> => {
    arbejde = { ...arbejde, tilstand: resultat.tilstand };
    await gem();
    udsend(skaermbillede());
  };

  /** Anvender et rettet scenarie, gemmer det ved siden af tilstanden og sender ud. */
  const anvendScenarie = async (nyt: Scenarie): Promise<void> => {
    scenarie = nyt;
    await gemJson(arbejdssti, scenarie);
    udsend(skaermbillede());
  };

  const loop = lavLoop(() => iKoe(udfoerSkridt), paaFejl);

  return {
    scenarie: () => scenarie,
    tilstand: () => arbejde.tilstand,
    skaermbillede,
    skridt: () => iKoe(udfoerSkridt),
    start: loop.start,
    stands: loop.stands,

    fyrHaendelse: (id) => iKoe(() => anvend(fyrNu(scenarie, arbejde.tilstand, id, ur.naa()))),
    kvitterAlarm: () => iKoe(() => anvend(kvitter(arbejde.tilstand, ur.naa()))),
    stopAlarm: () => iKoe(() => anvend(stop(scenarie, arbejde.tilstand, ur.naa()))),

    saetRavagen: (aendringer) =>
      iKoe(() => anvend(saetRavage(arbejde.tilstand, aendringer, ur.naa()))),

    /** Tilbage til planen: begge runtime-filer slettes, og scenariet laeses forfra. */
    nulstilNatten: () =>
      iKoe(async () => {
        await Promise.all([sletTilstand(konfig.tilstandssti), sletJson(arbejdssti)]);
        scenarie = await laesPlan(konfig.scenariesti);
        arbejde = { tilstand: nyTilstand(scenarie, ur.naa()), log: [], historik: tomHistorik() };
        udsend(skaermbillede());
      }),

    opretHaendelse: (ny) => iKoe(() => anvendScenarie(tilfoejHaendelse(scenarie, ny))),

    retHaendelsen: (id, aendringer) =>
      iKoe(() => anvendScenarie(retHaendelse(scenarie, id, aendringer))),

    aflysHaendelse: (id) =>
      iKoe(async () => {
        // En aktiv alarm kan ikke aflyses vaek. Den skal stoppes, saa
        // koerselstilstanden ikke bliver staaende og peger paa noget, der ikke findes.
        if (arbejde.tilstand.aktivAlarm?.haendelseId === id) {
          throw new ScenarieFejl(
            `Haendelsen "${id}" er en aktiv alarm. Stop alarmen foerst, hvis den skal aflyses.`,
          );
        }

        const nyt = fjernHaendelse(scenarie, id);
        // Ryd sporet i koerselstilstanden, saa id'et kan genbruges bagefter.
        arbejde = { ...arbejde, tilstand: udenSpor(arbejde.tilstand, id) };
        await gem();
        await anvendScenarie(nyt);
      }),
  };
};
