/**
 * Aendringer i scenariet fra admin-fladen.
 *
 * Det baerende valg her: **enhver aendring bygger et helt nyt scenarie, som skal
 * bestaa praecis den samme validering som filen paa disken.** Admin kan derfor
 * ikke bryde en eneste invariant - alarmradius, sektorer, unikke
 * id'er - uden at reglerne skal skrives to steder.
 *
 * Konsekvensen er, at fejlbeskederne fra `laesScenarie` gaar direkte videre til
 * telefonen. De er skrevet til et menneske, og det er praecis det, der skal
 * laese dem kl. 02.
 */

import { ScenarieFejl, laesScenarie } from './scenarie.js';
import type { Haendelse, Scenarie } from './typer.js';

/** Bygger scenariet om med en ny haendelsesliste og validerer det som helhed. */
const medHaendelser = (scenarie: Scenarie, haendelser: readonly unknown[]): Scenarie =>
  laesScenarie({ ...scenarie, haendelser });

const findHaendelse = (scenarie: Scenarie, id: string): Haendelse => {
  const h = scenarie.haendelser.find((x) => x.id === id);
  if (!h) {
    throw new ScenarieFejl(`Ukendt haendelse "${id}"`);
  }
  return h;
};

export const tilfoejHaendelse = (scenarie: Scenarie, ny: unknown): Scenarie =>
  medHaendelser(scenarie, [...scenarie.haendelser, ny]);

/**
 * Retter felter paa en eksisterende haendelse.
 *
 * `id` og `type` kan ikke aendres. At skifte type paa en haendelse midt i natten
 * ville efterlade koerselstilstanden med en fyret alarm, der pludselig er en
 * anomali - og id'et er det, tilstanden husker haendelsen paa.
 */
export const retHaendelse = (
  scenarie: Scenarie,
  id: string,
  aendringer: Record<string, unknown>,
): Scenarie => {
  const gammel = findHaendelse(scenarie, id);

  if ('id' in aendringer) {
    throw new ScenarieFejl('Et haendelses-id kan ikke aendres - opret en ny haendelse i stedet');
  }
  if ('type' in aendringer) {
    throw new ScenarieFejl('En haendelses type kan ikke aendres - opret en ny haendelse i stedet');
  }

  return medHaendelser(
    scenarie,
    scenarie.haendelser.map((h) => (h.id === id ? { ...gammel, ...aendringer } : h)),
  );
};

export const fjernHaendelse = (scenarie: Scenarie, id: string): Scenarie => {
  findHaendelse(scenarie, id);
  return medHaendelser(
    scenarie,
    scenarie.haendelser.filter((h) => h.id !== id),
  );
};
