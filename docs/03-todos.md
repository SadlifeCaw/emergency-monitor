# 03 — Opgavenedbrydning

Ni faser. Hver opgave har et acceptkriterium, så "færdig" ikke er en fornemmelse.
Rækkefølgen er valgt så **motoren og alarmen** — det eneste, der ikke må fejle —
er færdig og testet, længe før der bruges tid på CRT-effekter.

Legende: `[K]` kritisk sti · `[P]` kan køre parallelt · `[N]` nice-to-have

**Status pr. 5. september 2026:** fase 1-6 er færdige og grønne
(294 tests, 96 % dækning). Hele kæden er afprøvet ende til ende i browseren:
et langt tryk på telefonen fyrer alarmen, og skærmen viser den.

Næste skridt er fase 7 (robusthed, kiosk, soak-test) og fase 8 (indholdet).
Fase 0 blokerer stadig fase 8 — og fase 7's soak-test kræver hardwaren.

---

## Fase 0 — Beslutninger og rekognoscering

Ingen kode. Blokerer flere senere faser.

- [ ] `[K]` **Verificér basekoordinatet i marken.** `55.65831, 9.359385` er slået op
      i OpenStreetMap og peger på Vork Bakker 12. Tjek med GPS på stedet, at det
      rammer det sted, kortet skal centreres om.
      *Accept: koordinat noteret fra egen GPS, `base.verificeret: true`.*
- [ ] `[K]` **Fastlæg alarmpunktet(erne).** Rekognoscér ved dag **og** i mørke.
      *Accept: koordinat + gåtid med lygte + noteret at ruten er sikker.*
- [ ] `[K]` **Fastlæg nattens dato og udrykningstidspunkt.**
- [ ] `[K]` **Vælg og afprøv hardware.** Hvilken PC? Hvilken skærm/projektor?
      Opløsning? Hvordan kommer telefonen på samme net (router eller hotspot)?
      *Accept: maskinen har kørt en browser i fuldskærm i to timer uden at gå i dvale.*
- [ ] `[K]` **Afprøv at telefonen kan nå serveren.** Kør `npm run adminlink` og
      åbn linket på telefonen. Virker det ikke, er det næsten altid **Windows
      Firewall**, som skal tillade Node.js på private netværk.
      *Det skal opdages i god tid, ikke på aftenen. Bemærk at skærmen selv kører
      på localhost og er upåvirket af netværket — det er kun styringen, der
      afhænger af det.*
- [ ] `[P]` **Lås kultens navn, overtro og beskedtekster** (gruppeudvalget).
      *Accept: `docs/01-koncept.md`-tabellen over åbne beslutninger er tom.*
- [ ] `[P]` **Beslut samspillet med papirarbejdet:** hvad afslører skærmen, og
      hvad står kun på papir? De må ikke sige det samme.

---

## Fase 1 — Skelet

- [x] `[K]` Initialisér repo: `git init`, `.gitignore` (ignorér `state/`, `assets/maps/`, `.env`)
- [x] `[K]` `npm` workspaces: `server`, `display` — `admin` tilføjes i fase 6
- [x] `[K]` TypeScript strict, ESLint, Prettier, Vitest opsat
- [x] `[K]` Fastify serverer skærmen på `:8080` + `/health` + `/api/state`
- [x] `[K]` WebSocket-endepunkt der sender skærmbilledet ved hvert tick
- [x] `[K]` Skærmen genforbinder selv med eksponentiel backoff (`display/src/main.ts`)
- [x] `[K]` Konfiguration fra miljøvariabler; serveren nægter at starte i drift uden admin-token

---

## Fase 2 — Scenarie-motoren `[K]`

**Kernen. Skrives test-først (RED → GREEN → REFACTOR) jf. husreglerne.**

- [x] Skriv tests for motoren **før** implementation:
  - hændelse fyrer på det planlagte tidspunkt, ikke før
  - hændelse fyrer ikke to gange
  - anomali opløses automatisk efter `autoOploesSek`
  - fasen skifter til `OPTRAPNING` `optrapningSek` før alarmen
  - alarm forbliver aktiv, indtil den kvitteres eller stoppes
  - `fyr nu` overstyrer det planlagte tidspunkt
  - tilstand genindlæst fra disk genfyrer ikke gamle hændelser
- [x] `motor/ur.ts` — injicerbart ur med `hastighed`-faktor til tidskomprimering
- [x] `motor/scenarie.ts` — zod-skema, kronologisk sortering, tydelige danske fejlbeskeder
- [x] `motor/geo.ts` — haversine-afstand, pejling og DDM-format, testet mod håndregnede værdier
- [x] `lager/tilstandslager.ts` — atomisk skriv, sikkerhedskopi, testet med afbrudt skrivning
- [x] `motor/telemetri.ts` — hash-baseret determinisme, optrapningsrampe, logstrøm
- [x] `drift/skaermbillede.ts` — visningsmodel med afstand, pejling og DDM-koordinat
- [x] Sammenkobling: tick-loop → motor → lager → udsending (`drift/natvagt.ts`)
      *Accept opfyldt: 143 tests grønne, 96 % dækning, og hele natten afspilles
      mod den rigtige `scenarios/nat.json` på 78 ms i `server/test/natvagt.test.ts`.*

---

## Fase 3 — Kortet `[K]`

- [x] `scripts/hent-kort.mjs` — henter go-pmtiles og trækker bbox ud af det
      daglige planet-build via range-requests. Bbox udledes af `scenarios/nat.json`,
      så kortet følger med, hvis fase 0 flytter basen.
      *Resultat: `assets/maps/vork.pmtiles`, **2,2 MB** — ikke de 100-400 MB
      specen antog. Kortet ligger derfor med i git.*
- [x] Leaflet + `protomaps-leaflet` med lokal fil, `Range`-requests på serveren
      *Verificeret: `accept-ranges: bytes`, `206 Partial Content`, magic-bytes `PMTiles`.*
- [x] Mørk fosfor-styling af kortet (veje dæmpede, kortetiketter helt fra)
- [x] Base-markør, afstandsringe 200/400/800 m, 8 sektorlinjer med numre
- [x] Roterende radar-sweep (canvas-overlay), drevet af den lokale animationstid.
      *Rettet efter første version: vinklen kom fra `serverKl`, som kun opdateres
      1 gang i sekundet — ved 8 sek./omdrejning gav det spring på 45°. Sweepet er
      stemning, ikke måledata, så det kører nu frit af scenariet og er også roligt
      under den 60× komprimerede generalprøve.
      Målt i browseren: **61 unikke billeder pr. sekund** mod 1-2 før.
      Halen tegnes som én conic gradient (var 32 kiler med synlige bånd),
      størrelsen måles med `ResizeObserver` frem for `clientWidth` hvert billede,
      og der tegnes i `devicePixelRatio` for skarpe kanter.*
- [x] `[K]` **Fallback bygget — men anderledes end specen sagde.** I stedet for et
      raster-billede tegnes et nødgitter, og ringe, sektorer og alarmpunkt bliver
      stående. Begrundelse: vagtholdet navigerer på pejling og afstand, og de tal
      står på skærmen uanset kortet. Færre bevægelige dele. Se `overlays.ts`.
      Viser generalprøven i fase 9 et behov for genkendeligt terræn, kan et
      raster-udsnit lægges ind som ekstra lag.
- [x] Kortet er verificeret i browseren: 42 tegnede tiles, 16 stier, 8 sektornumre,
      alarmpunkt `394 m · 060°`, ingen konsolfejl.
- [x] Offline-verifikation: ingen eksterne opslag i det byggede bundle.
- [ ] `[N]` P01-P15 fra stedlisten som svage markører, når de er placeret
- [x] `[N]` Ringe og sektornumre falder uden for billedet, når kortet zoomer til
      alarmen. **Løst i fase 4** med en afstandsskala i kortets hjørne, der
      vælger runde længder (25/50/100/200/500/1000 m) og følger zoomet.

---

## Fase 4 — Panelerne

**Designretning:** instrument, ikke dashboard. Referencen er en kurveskriver og
en myndighedsterminal fra ca. 1988 — hårfine streger frem for kort med skygger,
kontinuerte kurver med synlig pen frem for søjler, blokmeter i tegn frem for en
afrundet bjælke, og loggen som en papirstrimmel i bunden.

Én begrænsning styrer lysstyrken, og den er ikke æstetisk: **deltagerne skal ud
i mørket bagefter.** En skærm, de har stirret på i seks timer, må ikke ødelægge
deres nattesyn. Derfor ligger alt i det nederste luminansområde, der er ingen
store lyse flader, og fuld styrke er reserveret til alarmen.

- [x] `[K]` Header: ur i **lokal tid** (ikke UTC), vagthold, statuslampe, fase
      *Separatoren er kolon og ikke det danske punktum: skærmen er fuld af
      decimaltal som 0.047, og "02.14.00" ved siden af dem kan læses forkert.*
- [x] `[K]` Telemetri-log: ringbuffer, nyeste linje nederst som på en printer,
      niveau vist med ét tegn i margenen (`!` rav, `*` rød) frem for et mærkat,
      nyeste linje skrives ud tegn for tegn
- [x] `[K]` Kurveskrivere: tre canvas-strip-charts med pen, grundlinjer og
      dæmpet flade under kurven. **Historikken kommer fra serveren**, ikke fra
      klientens hukommelse — ellers ville en genstart kl. 02.10 give tomme grafer
      præcis når rampen mod alarmen skulle være synlig.
      *Vinduet er 300 sekunder, præcis så langt som optrapningen: når alarmen
      falder, fylder hele opbygningen grafens bredde.*
- [x] `[K]` Dekrypteringspanel: blokmeter i tegn + fragment i papirfarve med
      overstregning af det, der endnu ikke er dekrypteret
- [x] `[K]` Statuspanel: hvad systemet mener, i hele sætninger
- [x] `[P]` CRT-lag: scanlines og vignet, holdt svage nok til at læses som
      tekstur frem for effekt
- [x] `[P]` Layout: CSS-grid med rodstørrelse der skalerer med skærmen
      (`clamp` på både bredde og højde), så det følger den projektor der
      ender med at blive valgt. Stabler på skærme i portrætformat.
- [x] Afstandsskalaen gentages i kortets hjørne — den løser fase 3-punktet om
      at ringene glider ud af billedet, når kortet zoomer til alarmen.
- [ ] `[K]` **Læsbarhedstest i mørke på den faktiske projektor** (hører sammen
      med fase 5's test): kan koordinatet skrives korrekt af fra 3 m?

---

## Fase 5 — Alarmtilstanden `[K]`

Den vigtigste enkeltopgave i projektet.

- [x] Alarmovertagelse: rød ramme om hele skærmen, kortet zoomer, punktet pulserer.
      **Udrykningsfeltet overtager hele instrumentsøjlen** — kurver og
      dekryptering skjules. Ingen har brug for dem, når alarmen er bekræftet,
      og pladsen er det, der gør tallene store nok til at kunne skrives af.
- [x] Stort udrykningsfelt i den rækkefølge, de skal bruge det:
      afstand og pejling (får dem op af stolen) → koordinat (skrives af) →
      nærmeste kendte punkt → tid siden.
      *Koordinatet står på to linjer i papirfarve med luft mellem cifrene.
      Én linje ville have været for smalt at læse på afstand, og to linjer er
      også måden, et koordinat læses op og skrives ned på.*
- [x] Tid siden alarmen faldt, `MM:SS` (`T:MM:SS` efter en time)
- [x] Lyd: to-tonet sirene, 2 sek. signal og 3 sek. stilhed, så de kan tale sammen
      *Tonerne **syntetiseres med Web Audio** i stedet for at ligge som filer:
      ingen licens at holde styr på, ingen fil at glemme at kopiere med over på
      driftsmaskinen, og det virker offline per definition. Det fjerner samtidig
      fase 8-punktet om at finde lydfiler.*
- [x] `[K]` Armering af lyden. **Bygget som en bjælke, ikke som en overlejring.**
      En overlejring ville have været sikrere ved opsætningen, men hvis browseren
      genstarter kl. 03, ville den efterlade en død skærm, ingen er vågen til at
      trykke væk. Bjælken er ravgul og pulserende — umulig at overse, når man står
      ved maskinen, harmløs når man ikke gør.
      *Den egentlige løsning i drift er Chrome-flaget
      `--autoplay-policy=no-user-gesture-required` — hører til fase 7's kiosk-script.*
- [x] Sirenen starter også, hvis skærmen genindlæses midt i en alarm, og tier
      så snart vagthavende har kvitteret. Beslutningslogikken ligger i
      `lydbeslutning.ts` som en ren funktion med 14 tests — en sirene, der ikke
      tier, er ikke noget man vil opdage under generalprøven.
- [x] Anomali-tilstand: gul, `AFVENTER BEKRÆFTELSE`, ét blip, opløses selv.
      Under alarm er der stille — sirenen har ordet.
- [x] Sweepet dæmpes kraftigt under alarm. Radaren leder ikke længere; den har
      fundet noget. Uden dæmpningen konkurrerede den grønne kile med det røde punkt.
- [ ] `[K]` **Læsbarhedstest i mørke på den faktiske projektor**: kan koordinatet
      skrives korrekt af fra 3 m? *Kræver hardwaren fra fase 0.*

---

## Fase 6 — Admin `[K]`

**Det bærende valg:** enhver ændring fra telefonen bygger et helt nyt scenarie,
som skal bestå **præcis den samme validering som filen på disken**. Admin kan
derfor ikke bryde en eneste invariant — alarmradius, sektorer, vagtvindue,
unikke id'er — uden at reglerne skal skrives to steder. Validatorens danske
fejlbeskeder går ordret videre til telefonen; de er skrevet til et menneske.

- [x] Token-godkendelse (konstanttid), opstartsvalidering, rate limit 90/min
- [x] Hændelsesliste med status og nedtælling. Nedtællingen løber lokalt mellem
      opdateringerne, så tallene er bløde uden at telefonen spørger hvert sekund.
- [x] **Alarmpanel øverst med tidspunkt og koordinat.** Der er som regel én
      alarm pr. nat, og den er hele aktiviteten — så den står for sig selv i
      stedet for som en række i listen blandt meldinger og dekrypteringer.
      *Panelet regner afstand, pejling, sektor og DDM-koordinat ud **mens der
      tastes**, med de samme funktioner som serveren og skærmen bruger. Det er
      panelets vigtigste egenskab: et taste-slip i et koordinat ser ud som et
      gyldigt koordinat, men "9753 m fra basen — uden for området på 800 m"
      opdages, før nogen tror det er sat.*
      *Minikort fravalgt: tallene er en bedre kontrol end en prik på et lille
      kort på en telefon i mørke.*
- [x] Opret/ret/aflys øvrige hændelser. Én formular til begge dele — at rette
      en hændelse er at oprette den igen med de samme oplysninger, og to næsten
      ens formularer ville drive fra hinanden. Felterne følger typen: en anomali
      har sektor og frist, en dekryptering har procent og fragment.
- [x] `npm run i-aften` flytter natten til nu, så den kan prøves af.
      *Uden den ligger scenariets tidspunkter i fortiden på enhver anden dato
      end den rigtige nat, motoren indhenter dem på første tick, og man står med
      fasen `AFSLUTTET` og ingen alarm at fyre. Det var ikke en fejl i koden,
      men det gjorde fladen ubrugelig at afprøve.*
- [x] `FYR ALARM NU` med 2 sek. langt tryk og synlig fremdrift.
      Et almindeligt klik gør bevidst ingenting.
- [x] `STOP ALARM` (langt tryk), `KVITTÉR` (kort tryk — den kan fortrydes)
- [x] `NULSTIL NATTEN` kræver `?bekraeft=ja`
- [x] Helbredsvisning: er skærmen forbundet, og kører tiden komprimeret
- [x] `[K]` Radius-validering med en klar besked
- [x] **Kommandokø:** admin-kommandoer og tick-loopet serialiseres. `skridt()`
      venter på at tilstanden er skrevet til disken, og en kommando i den
      ventetid ville kunne læse en forældet tilstand og få sin egen skrivning
      overskrevet — "jeg trykkede FYR, og der skete ingenting" kl. 02.14.
- [x] Admins ændringer gemmes i `state/scenarie.json`, **ikke** i
      `scenarios/nat.json`. Planen røres aldrig, og nulstilling sletter én mappe.
- [x] `npm run adminlink` finder maskinens IP og skriver linket med token
- [x] **Øvrige hændelser falder af sig selv.** *Erstattede den oprindelige
      `spredningMin`-løsning, som trak tider én gang ved nattens begyndelse.*
      Monitoren kører hele ugen i ét stræk, ikke én nat, så en liste over
      planlagte hændelser holder ikke: efter syv døgn er den brugt op.
      Stemningen udledes i stedet **direkte af uret** (`motor/stemning.ts`).
      Anomalier og dekryptering optræder i vinduer på 15 minutter, kun inden for
      det natvindue instruktørerne selv sætter i scenariet, og **aldrig mens en
      alarm kører**. Ingenting akkumulerer, og en genstart giver den samme nat.
      *Hændelserne står ikke i admin — der er intet at vide om dem.*
- [x] **Dekrypteringen er ren stemning.** Den behøver ikke stige meningsfuldt;
      kultens navn afsløres på papir, ikke på skærmen. Fragmenter, der gjorde
      konkrete påstande om historien, er slettet — de modsagde papirarbejdet.
- [x] **Fladen er tegnet om** som en fjernbetjening i fire faste zoner: status,
      besked, rullefelt, greb. Den store handling ligger fast i bunden, hvor
      tommelfingeren er, og alarmtilstand markeres med form og placering — ikke
      med en lys flade, der afslører instruktøren blandt deltagerne.
      *Rækkerne tildeles udtrykkeligt: beskedbjælken er `hidden` det meste af
      tiden, og `display: none` fjerner et element helt fra gitteret, så med
      positionelle rækker blev grebet presset ned under skærmkanten.*
- [x] **Forstyrrelser (ravage).** Tre kontakter, der sætter monitoren ud af
      drift: slør kortet, skjul koordinatet, glitch. Kontakterne bevæger sig
      fysisk, så de kan aflæses uden at læse, og de kræver ikke langt tryk —
      en forstyrrelse kan altid slås fra igen.
      *Koordinatet withholdes på serveren, ikke i CSS; ellers står det i
      klartekst i DOM'et. Sløringen rammer kun kortfliserne, så ringe, sektorer
      og alarmpunkt bliver skarpe.*
- [ ] `[K]` **Afprøv hele flowet på din egen telefon, i mørke, med én hånd.**
      *Kræver hardwaren og nettet fra fase 0.*

---

## Fase 7 — Robusthed

- [ ] WS-reconnect med backoff + synlig "FORBINDELSE TABT"-bjælke
- [ ] Fuld tilstandshentning ved reconnect
- [ ] Genoptagelse efter server-genstart (testet ved at dræbe processen midt i natten)
- [ ] `scripts/start-natvagt.ps1`: start server, sæt `powercfg`, start kiosk-Chrome
- [ ] Screen Wake Lock i displayet
- [ ] `scripts/selvtest.mjs`: tjekker kortfil, lydfiler, scenariefil, token, diskplads, ur
      *Accept: `npm run selvtest` giver GRØN på den faktiske maskine.*
- [ ] `[K]` **7-døgns soak-test** på den rigtige maskine. *Ikke 8 timer: monitoren
      kører hele kurset i ét stræk, og det er præcis derfor den skal prøves så
      længe. Døgnskiftet og natvinduet skal ramme rigtigt syv gange i træk.*
      *Accept: ingen hukommelsesvækst, ingen fald i billedrate, uret er stadig korrekt.*

---

## Fase 8 — Indhold og fiktion

Kan køre parallelt med fase 3-7, men kræver fase 0.

- [ ] `[P]` Skriv 200-300 logliniers puljer i VASE-sprog (rutine, sweep, status)
- [ ] `[P]` Skriv anomali-teksterne — troværdige, ikke skræmmende
- [ ] `[P]` Skriv dekrypteringsfragmenterne, så de afslører kultens navn i den rigtige rækkefølge
- [ ] `[P]` Skriv alarmteksten og hjemkomst-/afslutningsskærmen
- [ ] `[P]` Byg `scenarios/nat.json` med den faktiske tidsplan
- [ ] `[P]` Find eller lav lydene (sirene, blip, alert) — tjek licens
      *Accept: en instruktør, der ikke har været med til at bygge det, læser skærmen
      og forstår historien uden forklaring.*

---

## Fase 9 — Generalprøve og drift

- [ ] `[K]` Kør `generalprove.json` hjemme i komprimeret tid, hele forløbet
- [ ] `[K]` **Generalprøve på Vork i mørke** med opstilling, skærm og telefon
- [ ] Print nødprocedure på papir: hvordan genstarter man? hvad hvis skærmen er sort?
      Hvordan fyrer man alarmen manuelt, hvis serveren er død? (svar: råb det)
- [ ] Print admin-QR-koden og læg den i lommen
- [ ] Reserveplan: hvad gør vi, hvis monitoren dør kl. 01? Aktiviteten skal kunne
      gennemføres uden skærm.
      *Accept: nødproceduren er afprøvet ved at slukke for strømmen midt i prøven.*

---

## Kritisk sti

```
Fase 0 (koordinater + hardware)
   └─▶ Fase 1 skelet
         └─▶ Fase 2 motor  ◀── vigtigste fase
               ├─▶ Fase 3 kort ──┐
               ├─▶ Fase 4 paneler┼─▶ Fase 5 alarm ─▶ Fase 7 robusthed ─▶ Fase 9 generalprøve
               └─▶ Fase 6 admin ─┘
Fase 8 indhold kører parallelt fra fase 0
```

**Hvis tiden bliver knap, skæres i denne rækkefølge:** CRT-effekter, dekrypteringspanel,
grafer, P01-P15-markører. Kort + log + alarm + admin er ufravigelige.
