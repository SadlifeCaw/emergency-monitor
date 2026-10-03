/**
 * Formatering til skaermen.
 *
 * Alt her tjener ét formaal: tal maa ikke hoppe. Et felt, der skifter bredde,
 * naar 9 bliver til 10, traekker oejet til sig hver gang - og efter seks timer
 * er det udmattende. Derfor fast bredde og nulpolstring hele vejen igennem,
 * som paa et instrument med mekaniske cifre.
 */

const FULD = '█';
const TOM = '░';

/**
 * Klokkeslaet i lokal tid.
 *
 * Serveren sender ISO-tid i UTC. Om sommeren er Danmark to timer foran, og en
 * skaerm der viser 01:57, naar klokken er 03:57, er direkte vildledende midt om
 * natten. Omregningen sker her, ét sted.
 *
 * Separatoren er kolon og ikke det danske punktum. Det er et bevidst brud med
 * konventionen: skaermen er fuld af decimaltal som 0.047, og "02.14.00" ved
 * siden af dem kan laeses forkert i moerke. Formatet bygges af enkeltdele frem
 * for af locale-strengen, saa det er det samme i enhver browser.
 */
export const lokalTid = (
  isoTid: string,
  tidszone = 'Europe/Copenhagen',
  medSekunder = true,
): string => {
  const dele = new Intl.DateTimeFormat('en-GB', {
    hour12: false,
    timeZone: tidszone,
    hour: '2-digit',
    minute: '2-digit',
    ...(medSekunder ? { second: '2-digit' } : {}),
  }).formatToParts(new Date(isoTid));

  const hent = (slags: Intl.DateTimeFormatPartTypes): string =>
    dele.find((d) => d.type === slags)?.value.padStart(2, '0') ?? '00';

  const timeMinut = `${hent('hour')}:${hent('minute')}`;
  return medSekunder ? `${timeMinut}:${hent('second')}` : timeMinut;
};

/** Tal med fast bredde: `fastTal(7.4, 2, 1)` giver "07.4". */
export const fastTal = (vaerdi: number, heltalscifre: number, decimaler: number): string => {
  const fortegn = vaerdi < 0 ? '-' : '';
  const [hele = '0', del = ''] = Math.abs(vaerdi).toFixed(decimaler).split('.');
  const polstret = hele.padStart(heltalscifre, '0');
  return `${fortegn}${polstret}${decimaler > 0 ? `.${del}` : ''}`;
};

/**
 * Blokmeter i tegn frem for en tegnet bjaelke.
 *
 * Valgt fordi det er, hvad en terminal fra 1988 kunne: meteret er sat med den
 * samme skrift som alt andet paa skaermen og deler dens rytme.
 */
export const blokmeter = (procent: number, bredde: number): string => {
  const andel = Math.min(100, Math.max(0, procent)) / 100;
  const fyldt = Math.round(andel * bredde);
  return FULD.repeat(fyldt) + TOM.repeat(bredde - fyldt);
};


/**
 * Tid siden alarmen faldt, som MM:SS.
 *
 * Ikke for at presse nogen, men fordi et vagthold skal kunne notere, hvor lang
 * tid der gik - og fordi en instruktoer skal kunne se, om de er blevet vaek.
 * Over en time skiftes til T:MM:SS, saa tallet ikke lyver.
 */
export const forloebet = (sekunder: number): string => {
  const s = Math.max(0, Math.floor(sekunder));
  const timer = Math.floor(s / 3600);
  const minutter = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const mmss = `${String(minutter).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return timer > 0 ? `${timer}:${mmss}` : mmss;
};
