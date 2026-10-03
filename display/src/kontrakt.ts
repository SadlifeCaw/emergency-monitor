/**
 * Kontrakten mellem server og skaerm.
 *
 * Typerne genbruges direkte fra serveren i stedet for at blive skrevet af.
 * Importen er type-only og forsvinder ved bygning, saa skaermen faar ingen
 * runtime-afhaengighed af server-koden - men den kan heller ikke komme til at
 * tegne et felt, serveren ikke sender.
 *
 * Hele koblingen mellem de to arbejdsomraader staar her i én fil. Skal den
 * brydes senere, er det den ene fil, der skal skrives om.
 */

export type {
  AlarmVisning,
  AnomaliVisning,
  Sensorhistorik,
  Skaermbillede,
} from '../../server/src/drift/skaermbillede.js';

export type { Loglinje, Logniveau, Sensoraflaesning } from '../../server/src/motor/telemetri.js';

export type { Fase } from '../../server/src/motor/typer.js';
