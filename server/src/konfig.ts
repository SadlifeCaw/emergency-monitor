/**
 * Konfiguration fra miljoevariabler.
 *
 * Ingen hemmeligheder i kildekoden. Serveren naegter at starte i drift uden et
 * admin-token - det er bedre at opdage kl. 19 end kl. 02.
 */

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export class KonfigFejl extends Error {
  constructor(besked: string) {
    super(besked);
    this.name = 'KonfigFejl';
  }
}

export type Miljoe = 'drift' | 'udvikling';

export interface Konfig {
  readonly miljoe: Miljoe;
  readonly vaert: string;
  readonly port: number;
  readonly adminToken: string;
  /** Sat naar tokenet blev genereret automatisk, saa opstarten kan skrive det ud. */
  readonly tokenErGenereret: boolean;
  readonly scenariesti: string;
  readonly tilstandssti: string;
  /** 1 = realtid. 60 = hele natten paa 5,5 minut, til generalproeven. */
  readonly hastighed: number;
  /** Virtuelt starttidspunkt. Kun relevant sammen med hastighed > 1. */
  readonly virtuelStart: number | null;
  /** Antal loglinjer skaermen holder i hukommelsen. Fast loft mod hukommelseslaek. */
  readonly logloft: number;
}

const MINIMUM_TOKENLAENGDE = 16;
const STANDARD_LOGLOFT = 200;

const tekst = (navn: string, standard: string): string => process.env[navn]?.trim() || standard;

const tal = (navn: string, standard: number): number => {
  const raa = process.env[navn]?.trim();
  if (!raa) return standard;
  const v = Number(raa);
  if (!Number.isFinite(v)) {
    throw new KonfigFejl(`${navn} skal vaere et tal, men var "${raa}"`);
  }
  return v;
};

const laesMiljoe = (): Miljoe => {
  const raa = tekst('NATVAGT_MILJOE', 'udvikling');
  if (raa !== 'drift' && raa !== 'udvikling') {
    throw new KonfigFejl(`NATVAGT_MILJOE skal vaere "drift" eller "udvikling", men var "${raa}"`);
  }
  return raa;
};

/**
 * I drift kraeves et rigtigt token. I udvikling genereres et flygtigt, saa man
 * ikke skal saette miljoevariabler for at koere serveren lokalt.
 */
const laesToken = (miljoe: Miljoe): { token: string; genereret: boolean } => {
  const raa = process.env['NATVAGT_ADMIN_TOKEN']?.trim() ?? '';

  if (raa.length >= MINIMUM_TOKENLAENGDE) {
    return { token: raa, genereret: false };
  }

  if (miljoe === 'drift') {
    const hvorfor = raa.length === 0 ? 'mangler' : `er kun ${raa.length} tegn`;
    throw new KonfigFejl(
      `NATVAGT_ADMIN_TOKEN ${hvorfor}. Kraever mindst ${MINIMUM_TOKENLAENGDE} tegn i drift. ` +
        'Lav et med "npm run token".',
    );
  }

  return { token: randomBytes(24).toString('base64url'), genereret: true };
};

const laesVirtuelStart = (): number | null => {
  const raa = process.env['NATVAGT_VIRTUEL_START']?.trim();
  if (!raa) return null;
  const ms = Date.parse(raa);
  if (!Number.isFinite(ms)) {
    throw new KonfigFejl(`NATVAGT_VIRTUEL_START skal vaere et ISO 8601-tidspunkt, var "${raa}"`);
  }
  return ms;
};

export const laesKonfig = (rod: string): Konfig => {
  const miljoe = laesMiljoe();
  const { token, genereret } = laesToken(miljoe);
  const hastighed = tal('NATVAGT_HASTIGHED', 1);

  if (!(hastighed > 0)) {
    throw new KonfigFejl(`NATVAGT_HASTIGHED skal vaere stoerre end 0, var ${hastighed}`);
  }

  return {
    miljoe,
    vaert: tekst('NATVAGT_VAERT', '0.0.0.0'),
    port: tal('NATVAGT_PORT', 8477),
    adminToken: token,
    tokenErGenereret: genereret,
    scenariesti: resolve(rod, tekst('NATVAGT_SCENARIE', 'scenarios/nat.json')),
    tilstandssti: resolve(rod, tekst('NATVAGT_TILSTAND', 'state/runtime.json')),
    hastighed,
    virtuelStart: laesVirtuelStart(),
    logloft: tal('NATVAGT_LOGLOFT', STANDARD_LOGLOFT),
  };
};
