/**
 * Tekstpuljer til telemetri-loggen.
 *
 * FASE 8: disse puljer er arbejdstekster. De skal skrives om i VASE-sprog, saa de
 * passer til soendagens materiale - sagsnummer 26-017, forsegling 314, vogn T2.
 * Sigt efter 60-80 rutinelinjer, saa natten ikke gentager sig selv.
 *
 * Loggen er det instrument, der goer alarmen dramatisk: 95 % skal vaere kedeligt,
 * for at de sidste 5 % kan vaere det modsatte.
 *
 * `%S` erstattes med et sektornummer.
 */

export const RUTINE: readonly string[] = [
  'SWEEP SEKTOR %S ... INTET',
  'SWEEP SEKTOR %S ... BAGGRUND NORMAL',
  'EMF BASELINE INDEN FOR TOLERANCE',
  'SEISMISK BAGGRUND STABIL',
  'TERMISK DRIFT SOM FORVENTET',
  'SENSORKAEDE %S KVITTERER',
  'TIDSSIGNAL SYNKRONISERET',
  'ARKIVFORESPOERGSEL AFSLUTTET UDEN FUND',
  'STROEMFORSYNING NOMINEL',
  'DATALAGER 94 PCT LEDIG',
  'INGEN BEVAEGELSE REGISTRERET SEKTOR %S',
  'AUTOMATISK SELVTEST BESTAAET',
];

export const ADVARSEL: readonly string[] = [
  'SVAGT UDSLAG SEKTOR %S - AFVENTER BEKRAEFTELSE',
  'ENKELTMAALING UDEN FOR TOLERANCE SEKTOR %S',
  'GENTAGER SWEEP SEKTOR %S',
  'SIGNAL IKKE BEKRAEFTET AF NABOSENSOR',
  'MAALING KAN SKYLDES VEJRLIG - IKKE AFKLARET',
];

export const ALARM: readonly string[] = [
  'BEKRAEFTET AKTIVITET SEKTOR %S',
  'TO UAFHAENGIGE SENSORER ENIGE',
  'UDSLAG VEDVARER SEKTOR %S',
  'POSITION OPDATERET - AFVIGELSE UNDER 40 M',
  'AFVENTER MELDING FRA UDRYKKENDE HOLD',
];

/**
 * Anomalierne der genereres af sig selv gennem natten.
 *
 * FASE 8: skrives om i VASE-sprog. Teksten skal vaere troværdig og maalt, ikke
 * skraemmende - tvivlen skal ligge i det gule, saa den roede alarm er
 * utvetydig, naar den kommer.
 */
export const ANOMALI_TEKSTER: readonly { readonly titel: string; readonly tekst: string }[] = [
  { titel: 'SVAGT SEISMISK UDSLAG', tekst: 'AFVENTER BEKRAEFTELSE' },
  { titel: 'ENKELTMAALING UDEN FOR TOLERANCE', tekst: 'IKKE BEKRAEFTET AF NABOSENSOR' },
  { titel: 'KORTVARIGT EMF-UDSLAG', tekst: 'KAN SKYLDES VEJRLIG' },
  { titel: 'UREGELMAESSIG BAGGRUND', tekst: 'GENTAGER MAALING' },
  { titel: 'TERMISK AFVIGELSE', tekst: 'UNDER TAERSKEL FOR ALARM' },
  { titel: 'SIGNAL UDEN KILDE', tekst: 'AFVENTER BEKRAEFTELSE' },
];

/**
 * Dekrypteringspanelets fragmenter.
 *
 * FASE 8: rent stemningsmateriale. Kultens navn afsloeres paa papir, ikke her.
 *
 * Teksterne maa antyde og aldrig paastaa noget konkret. Tre tidligere fragmenter
 * er fjernet, fordi de gjorde netop det - "den syvende nat", "det sjette",
 * "tre gange" - og den slags kan komme til at modsige det, gruppeudvalget
 * ender med at beslutte.
 */
export const DEKRYPTERINGSFRAGMENTER: readonly string[] = [
  '...saa laenge solen vender, sover hun kun ...',
  '...det som blev taget, skal baeres tilbage ...',
  '...de gaar naar lyset er borte, og ikke foer ...',
  '...hendes navn maa ikke siges hoejt i marken ...',
];
