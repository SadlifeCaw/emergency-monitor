/**
 * Atomisk JSON-lager.
 *
 * Natten kan ikke koeres om, saa den maa kunne genoptages. Filer skrives
 * atomisk: foerst en tmp-fil, saa en rename. Gaar stroemmen midt i skrivningen,
 * ligger den gamle fil stadig uroert.
 *
 * Formatet er almindelig, laesbar JSON. Hvis alt andet fejler kl. 03, kan en
 * instruktoer rette filen i Notepad.
 *
 * Udtrukket herind, da baade koerselstilstanden og det redigerede scenarie skal
 * gemmes paa praecis samme maade - og det er ikke et sted, hvor to naesten ens
 * implementeringer maa drive fra hinanden.
 */

import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class LagerFejl extends Error {
  constructor(besked: string, options?: { cause?: unknown }) {
    super(besked, options);
    this.name = 'LagerFejl';
  }
}

const erIkkeFundet = (fejl: unknown): boolean =>
  typeof fejl === 'object' && fejl !== null && (fejl as { code?: string }).code === 'ENOENT';

/** Laeser og validerer én fil. Returnerer null hvis den slet ikke findes. */
const laesFil = async <T>(sti: string, tolk: (raa: unknown) => T): Promise<T | null> => {
  let raa: string;
  try {
    raa = await readFile(sti, 'utf8');
  } catch (fejl: unknown) {
    if (erIkkeFundet(fejl)) return null;
    throw fejl;
  }
  return tolk(JSON.parse(raa));
};

/**
 * Laeser en gemt fil.
 *
 * Er hovedfilen oedelagt, proeves sikkerhedskopien. Bedre at genoptage natten
 * et par sekunder forsinket end slet ikke at genoptage den.
 *
 * `hvad` indgaar i fejlbeskeden, saa den kan laeses af et menneske kl. 03.
 */
export const laesJson = async <T>(
  sti: string,
  tolk: (raa: unknown) => T,
  hvad: string,
): Promise<T | null> => {
  try {
    return await laesFil(sti, tolk);
  } catch (hovedfejl: unknown) {
    try {
      const sikkerhedskopi = await laesFil(`${sti}.bak`, tolk);
      if (sikkerhedskopi) return sikkerhedskopi;
    } catch {
      // Sikkerhedskopien er ogsaa vaek; den oprindelige fejl er den interessante.
    }
    throw new LagerFejl(
      `Kunne ikke laese gemt ${hvad} fra ${sti}, og sikkerhedskopien kunne heller ikke bruges`,
      { cause: hovedfejl },
    );
  }
};

/** Gemmer atomisk og beholder den forrige version som sikkerhedskopi. */
export const gemJson = async (sti: string, vaerdi: unknown): Promise<void> => {
  await mkdir(dirname(sti), { recursive: true });

  const tmp = `${sti}.tmp`;
  await writeFile(tmp, `${JSON.stringify(vaerdi, null, 2)}\n`, 'utf8');

  try {
    await copyFile(sti, `${sti}.bak`);
  } catch (fejl: unknown) {
    if (!erIkkeFundet(fejl)) {
      await rm(tmp, { force: true });
      throw new LagerFejl(`Kunne ikke skrive sikkerhedskopi til ${sti}.bak`, { cause: fejl });
    }
  }

  await rename(tmp, sti);
};

/** Fjerner en gemt fil og dens sikkerhedskopi. Bruges naar natten nulstilles. */
export const sletJson = async (sti: string): Promise<void> => {
  await Promise.all([
    rm(sti, { force: true }),
    rm(`${sti}.bak`, { force: true }),
    rm(`${sti}.tmp`, { force: true }),
  ]);
};
