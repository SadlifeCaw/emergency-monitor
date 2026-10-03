/**
 * Offentlige ruter: dem skaermen bruger.
 *
 * Ingen godkendelse - skaermen staar paa det samme lokalnet som serveren, og
 * der er intet fortroligt i et skaermbillede. Admin-ruterne i fase 6 er en
 * anden sag.
 */

import type { FastifyInstance } from 'fastify';
import type { Natvagt } from '../drift/natvagt.js';
import type { Udsending } from '../ws/udsending.js';

export interface OffentligeRuterAfhaengigheder {
  readonly natvagt: Natvagt;
  readonly udsending: Udsending;
}

export const registrerOffentligeRuter = (
  app: FastifyInstance,
  { natvagt, udsending }: OffentligeRuterAfhaengigheder,
): void => {
  /** Bruges af selvtesten og af kiosk-scriptet, foer browseren startes. */
  app.get('/health', () => ({
    status: 'ok',
    skaermeForbundet: udsending.antalKlienter(),
    fase: natvagt.tilstand().fase,
  }));

  /** Fuldt skaermbillede. Skaermen henter det ved opstart og ved hver genforbindelse. */
  app.get('/api/state', () => natvagt.skaermbillede());

  app.get('/ws', { websocket: true }, (forbindelse) => {
    udsending.tilfoej(forbindelse);

    // Send med det samme, saa skaermen ikke staar tom i op til et sekund.
    forbindelse.send(JSON.stringify(natvagt.skaermbillede()));

    forbindelse.on('close', () => udsending.fjern(forbindelse));
    forbindelse.on('error', () => udsending.fjern(forbindelse));
  });
};
