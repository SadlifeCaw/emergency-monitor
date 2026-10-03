/**
 * Adresseopslag - kun i admin.
 *
 * Skaermen er offline-first og roerer aldrig ved internettet. Opslaget sker
 * derfor fra instruktoerens telefon, direkte til OpenStreetMaps Nominatim, og
 * kun naar der trykkes "Find" (deres vilkaar forbyder opslag for hvert tegn).
 * Falder nettet vaek, er det kun den bekvemmelighed der forsvinder: koordinatet
 * kan stadig tastes.
 *
 * (Den danske DAWA er lukket - svarer 410 Gone.)
 */

export interface Adressetraef {
  readonly navn: string;
  readonly lat: number;
  readonly lon: number;
}

export type Hent = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const ENDEPUNKT = 'https://nominatim.openstreetmap.org/search';
const MAKS_TRAEF = 5;
/** Soegningen foretraekker ca. 25 km omkring basen, men er ikke begraenset til den. */
const SOEGEGRAD = 0.25;
const MIN_TEGN = 3;

export class AdresseFejl extends Error {}

interface Raatraef {
  readonly display_name?: unknown;
  readonly lat?: unknown;
  readonly lon?: unknown;
}

export const bygUrl = (soeg: string, base: { lat: number; lon: number }): string => {
  const { lat, lon } = base;
  const viewbox = [lon - SOEGEGRAD, lat + SOEGEGRAD, lon + SOEGEGRAD, lat - SOEGEGRAD].join(',');
  const params = new URLSearchParams({
    q: soeg,
    format: 'jsonv2',
    limit: String(MAKS_TRAEF),
    countrycodes: 'dk',
    viewbox,
    'accept-language': 'da',
  });
  return `${ENDEPUNKT}?${params.toString()}`;
};

export const soegAdresse = async (
  soeg: string,
  base: { lat: number; lon: number },
  hent: Hent,
): Promise<Adressetraef[]> => {
  const tekst = soeg.trim();
  if (tekst.length < MIN_TEGN) throw new AdresseFejl('Skriv mindst tre tegn.');

  let svar;
  try {
    svar = await hent(bygUrl(tekst, base));
  } catch {
    throw new AdresseFejl('Ingen forbindelse til opslag. Tast koordinatet i stedet.');
  }
  if (!svar.ok) throw new AdresseFejl('Opslaget fejlede. Prøv igen, eller tast koordinatet.');

  const raa = await svar.json();
  if (!Array.isArray(raa)) throw new AdresseFejl('Uventet svar fra opslaget.');

  return (raa as Raatraef[])
    .map((r) => ({ navn: String(r.display_name ?? ''), lat: Number(r.lat), lon: Number(r.lon) }))
    .filter((t) => t.navn !== '' && Number.isFinite(t.lat) && Number.isFinite(t.lon))
    .slice(0, MAKS_TRAEF);
};
