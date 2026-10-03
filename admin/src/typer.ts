/**
 * Kontrakten mod admin-API'et.
 *
 * Type-only genbrug fra serveren, som i display/src/kontrakt.ts. Importen
 * forsvinder ved bygning, saa fladen faar ingen runtime-afhaengighed af
 * server-koden - men den kan heller ikke komme til at tegne et felt, serveren
 * ikke sender.
 */

export type {
  Adminoversigt,
  HaendelseIOversigt,
  Haendelsesstatus,
} from '../../server/src/drift/adminoversigt.js';
