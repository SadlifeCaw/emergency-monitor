/**
 * Klienten mod admin-API'et.
 *
 * Serverens fejlbeskeder er skrevet til et menneske - "alarmen ligger 8123 m
 * fra basen, men graensen er 800 m" - og de vises derfor ordret. At oversaette
 * dem til "noget gik galt" ville smide netop den oplysning vaek, man skal bruge
 * for at rette fejlen.
 */

const TOKEN_NOEGLE = 'natvagt.admintoken';

export type Svar<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly fejl: string; readonly ugyldigtToken?: boolean };

const besked = (krop: unknown, standard: string): string => {
  if (typeof krop === 'object' && krop !== null && 'fejl' in krop) {
    const f = (krop as { fejl: unknown }).fejl;
    if (typeof f === 'string' && f.length > 0) return f;
  }
  return standard;
};

/** Ren funktion, saa fejlhaandteringen kan afproeves uden en server. */
export const tolkSvar = <T>(status: number, krop: unknown): Svar<T> => {
  if (status >= 200 && status < 300) return { ok: true, data: krop as T };

  if (status === 401) {
    return {
      ok: false,
      fejl: besked(krop, 'Forkert eller manglende adgangstoken.'),
      ugyldigtToken: true,
    };
  }

  return { ok: false, fejl: besked(krop, 'Serveren svarede ikke som forventet.') };
};

/**
 * Tokenet.
 *
 * Kommer foerste gang fra linkets `?token=` - saa en QR-kode, der er printet i
 * forvejen, virker. Derefter ligger det i localStorage, og adressen ryddes, saa
 * det ikke bliver staaende i adressefeltet hele natten.
 */
export const hentToken = (): string => {
  const fraUrl = new URLSearchParams(location.search).get('token');
  if (fraUrl) {
    try {
      localStorage.setItem(TOKEN_NOEGLE, fraUrl);
    } catch {
      // Privat browsertilstand. Tokenet holder saa kun til denne side.
    }
    history.replaceState(null, '', location.pathname);
    return fraUrl;
  }
  try {
    return localStorage.getItem(TOKEN_NOEGLE) ?? '';
  } catch {
    return '';
  }
};

export const gemToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_NOEGLE, token);
  } catch {
    // Ignoreres bevidst; fladen virker stadig, indtil siden genindlaeses.
  }
};

export const glemToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_NOEGLE);
  } catch {
    // Ingen adgang til localStorage.
  }
};

export const kald = async <T>(
  sti: string,
  metode: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  krop?: unknown,
): Promise<Svar<T>> => {
  let svar: Response;
  try {
    svar = await fetch(sti, {
      method: metode,
      headers: {
        Authorization: `Bearer ${hentToken()}`,
        ...(krop === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(krop === undefined ? {} : { body: JSON.stringify(krop) }),
    });
  } catch {
    return { ok: false, fejl: 'Ingen forbindelse til natvagten. Er du paa samme net?' };
  }

  const tekst = await svar.text();
  let tolket: unknown = null;
  try {
    tolket = tekst ? JSON.parse(tekst) : null;
  } catch {
    tolket = null;
  }

  return tolkSvar<T>(svar.status, tolket);
};
