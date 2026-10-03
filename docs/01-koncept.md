# 01 — Koncept

## Præmis

VASE (Vork Arkæologiske Særlige Enhed) har efter optagelsesprøven fået adgang til
Egtved-arkivmaterialet. Materialet viser, at en kult har været i bevægelse omkring
Vork Bakker. Kulten forsøger at genoplive Egtvedpigen, og deres ritualer efterlader
målbare spor: jordvibrationer, elektromagnetiske udsving og lokale temperaturfald.

VASE har derfor sat en **feltmonitor** op i lejren. Den scanner området automatisk
hele natten. Nyoptaget personel — kandidaterne — sidder natvagt ved skærmen.

> Systemet finder det. I skal nå frem, før de er færdige.

## Systemets navn

Arbejdstitel på skærmen: **VASE // NATVAGT — STATION VORK**
Sensornetværkets kaldenavn: **SPOR-9**

## Åbne fiktionsbeslutninger (skal låses af gruppeudvalget)

Disse hører til jeres fiktion, ikke til koden. Koden læser dem fra config, så de
kan ændres til det sidste.

| Beslutning | Status | Note |
|---|---|---|
| Kultens navn | **ÅBEN** | Drejebogen gemmer det til nattens papirarbejde. Forslag: *Solvognens Døtre*, *Den Tavse Orden*, *Sjettedøtrene*. |
| Kultens overtro / ritualets logik | **ÅBEN** | Bestemmer papirsporet. Skærmen afslører det ikke — dekrypteringspanelet er ren stemning. |
| Kortets første halvdel | **ÅBEN** | Udleveres på papir. |
| Nattevindue og antal udslag | **ÅBEN** | Sættes i `scenarios/nat.json` under `nat`. Standard 23:00-05:00, 4 udslag pr. nat. |
| Nattens dato og udrykningstidspunkt | **ÅBEN** | Afhænger af ugeprogrammet. |
| Casper-rollens afsløring | **ÅBEN** | Drejebogen siger, den ikke røbes ved optagelsesprøven. Monitoren må ikke spoile den. |

## Æstetik

**Gammelt look, hacker-agtigt, men dedektiv — ikke Hollywood-hacker.**

Retningen er et *arkæologisk myndighedssystem fra ca. 1988, der stadig kører*.
Institutionelt og tørt frem for neon-cyberpunk. Det er en efterforskningsterminal,
ikke et spilinterface.

| Element | Valg |
|---|---|
| Baggrund | Meget mørk, let varm sort (`#0A0C0A`) — ikke ren sort |
| Primærfarve | Fosforgrøn (`#33FF6A`), dæmpet til ca. 80 % opacitet |
| Sekundær | Rav (`#FFB000`) til advarsler, papirhvid (`#D8D2C2`) til dokumenttekst |
| Alarm | Signalrød (`#FF2B2B`) — bruges **kun** ved ægte alarm |
| Typografi | Monospace hele vejen (IBM Plex Mono / VT323 til overskrifter) |
| Effekter | Fine scanlines, svag CRT-vignet, let flicker, tekst der "skrives" tegn for tegn |
| Rammer | Enkle 1px-streger og hjørnemarkører. Ingen afrundede hjørner, ingen skygger. |
| Sprog | Dansk, myndighedstørt. Store bogstaver i felt-labels. |

**Bevidst fravalgt:** Matrix-regn, tilfældige hex-dumps, blinkende "ACCESS GRANTED",
progress-barer uden betydning. Alt på skærmen skal kunne forklares som en måling.

Æstetikken skal vælges *bevidst* og ikke lande på en generisk mørk terminal-default
— se `docs/04-skills.md` for den skill, der bruges til at holde os til det.

## Skærmens seks paneler

```
┌──────────────────────────────────────────────────────────────────────┐
│ VASE // NATVAGT   STATION VORK   03:41:07   VAGTHOLD: B   STATUS: ●  │  1 Header
├──────────────────────────────┬───────────────────────────────────────┤
│                              │  SEISMIK    ▁▂▁▁▂▃▁▁▂▁▁▁▂▁            │  4 Grafer
│                              │  EMF        ▁▁▂▁▁▁▂▁▁▁▁▂▁▁            │
│         KORT                 │  TEMP       ▂▂▂▁▁▁▁▂▂▂▂▁▁▁            │
│      (radar-sweep)           ├───────────────────────────────────────┤
│                              │  DEKRYPTERING  ███████░░░  68 %       │  5 Dekryptering
│      ● BASE                  │  "...og den sovende skal vækkes ved   │
│                              │   det sjette ...███████..."           │
│                              ├───────────────────────────────────────┤
│                              │  02:41:12  SWEEP SEKTOR 4 ... INTET   │  3 Log
│                              │  02:41:44  EMF BASELINE OK            │
├──────────────────────────────┤  02:42:03  SWEEP SEKTOR 5 ... INTET   │
│ SEKTOR 5/8   RÆKKEVIDDE 800m │  02:42:31  ⚠ SVAGT UDSLAG SEKTOR 7    │
└──────────────────────────────┴───────────────────────────────────────┘
```

1. **Header** — systemnavn, ægte ur, vagthold, systemstatus-lampe.
2. **Kort** — mørkt taktisk kort centreret på lejren. Roterende radar-sweep,
   afstandsringe (200/400/800 m), sektorinddeling 1-8, base-markør.
3. **Telemetri-log** — rullende linjer. 95 % kedeligt. Loggen er det instrument,
   der gør alarmen dramatisk: når 40 linjers "INTET" pludselig bliver rød.
4. **Grafer** — seismik, EMF, temperatur. Rolig baseline-støj hele natten;
   scriptede udsving der begynder **før** alarmen, så et opmærksomt vagthold
   kan nå at reagere et halvt minut i forvejen. Det belønner opmærksomhed.
5. **Dekrypteringspanel** — ren stemning. Procenten driver op og ned, og
   fragmentet skifter en gang imellem. Det skal se ud som om systemet arbejder,
   ikke fortælle en historie: **kultens navn afsløres på papir, ikke her.**
6. **Alarmtilstand** — se nedenfor.

## Monitoren kører hele ugen

Det er ikke en enkelt nattevagt. Skærmen står tændt gennem hele kurset, og
instruktørerne ved — hvad deltagerne ikke gør — at der kun sker noget om natten.

Det har tre konsekvenser for, hvordan systemet er bygget:

**Der er ingen tidsplan.** Anomalier og dekryptering genereres af uret som en
ren funktion af (seed, tidspunkt), præcis som telemetrien. Der er ingen liste at
vedligeholde, intet der vokser, og en genstart kl. 03 giver samme nat som den,
der aldrig gik ned. Se `server/src/motor/stemning.ts`.

**Alarmen er det eneste, instruktørerne bestemmer.** Den oprettes fra telefonen,
når den skal bruges — programmet genstartes aldrig. Alt andet passer sig selv.

**Nattevinduet er en indstilling.** Standard 23:00–05:00. Uden for det kører
skærmen roligt videre med sweep, kurver og rutinelog, men der sker ingenting.

## Dramaturgi over natten

| Fase | Varighed | Hvad sker der |
|---|---|---|
| **Dag** | Uden for nattevinduet | Sweeps, kurver og rutinelog. Der sker ingenting, og instruktørerne ved det. |
| **Rolig** | Nattevinduet begynder | Baseline. Sweeps. Rutinemeldinger. |
| **Anomalier** | Tilfældigt gennem natten | Gule "udslag" der efter 1-2 min. selv opløses. Falske positiver, genereret af uret. |
| **Optrapning** | ~5 min før alarm | Dekryptering springer. Graferne bliver urolige. Loggen skifter tone. |
| **Alarm** | Udrykningstidspunktet | Fuld alarm. Punkt på kortet. |
| **Udrykning** | Efter alarm | Skærmen holder alarmen synlig med pejling, afstand og nedtælling. |
| **Efterspil** | Efter hjemkomst | Admin sætter status til `AFSLUTTET`. Skærmen viser roligt afslutningsbillede. |

### Forstyrrelser — når kulten rører ved udstyret

Ud over tidsplanen har instruktøren tre kontakter, der kan slås til når som helst:
kortet kan **sløres**, koordinatet kan **flakke ud**, og skærmen kan **glitche**.

De er et fortælleredskab, ikke en fejltilstand. Monitoren er deltagernes eneste
sikre kilde, og pointen er at tage noget af den fra dem uden at tage det hele:
sløres kortet, står ringene og sektorerne stadig; forsvinder koordinatet, står
afstand og pejling stadig. Der er altid nok tilbage til at handle på — det er
netop det, der gør det ubehageligt frem for umuligt.

Fordi de kan slås fra igen, kræver de ikke langt tryk som fyr og stop gør.

### Hvorfor falske positiver?

De gør ægte-alarmen troværdig og træner præcis den kompetence, optagelsesprøven
bedømte: **at skelne observation fra antagelse**. Et hold, der styrter ud ved
første gule udslag, har ikke læst skærmen. Anomalierne skal derfor være tydeligt
gule og ledsaget af `AFVENTER BEKRÆFTELSE` — de lyver ikke, de kræver tålmodighed.

**Vigtigt:** Den ægte alarm skal være **utvetydig**. Rød, lyd, fuldskærm.
Ingen tvivl kl. 03 om natten. Tvivlen ligger i de gule, ikke i den røde.

## Alarmtilstanden

Når alarmen udløses:

- Kortet zoomer til punktet, som pulserer rødt med en usikkerhedsradius.
- Alle paneler får rød kant. Loggen skifter til alarmlinjer.
- Sirene (kort, gentaget — ikke konstant hyl; de skal kunne tale sammen).
- Et stort felt viser det, holdet skal bruge for at komme afsted:

```
        ⚠  BEKRÆFTET AKTIVITET  ⚠
        SEKTOR 7 · 55°39.6'N 009°22.1'E
        AFSTAND  412 m      PEJLING  073°
        NÆRMESTE KENDTE PUNKT: P15 TREKANTSDEPOT
        UDRYK STRAKS · MELD VED ANKOMST
```

Fordi de ikke har mus eller tastatur, skal **alt** de skal bruge, stå på skærmen:
koordinat, afstand, pejling i grader og et kendt holdepunkt fra stedlisten.
Antag at de skriver det af på papir i mørke — store tal, høj kontrast.

## Sikkerhed og hensyn

- Deltagerne er 15-18 år og skal ud i mørke. Alarmpunktet skal ligge på et sted,
  gruppeudvalget har rekognosceret ved dag **og** ved nat.
- Skærmen skal aldrig sende dem mod vand, stejlt terræn eller ud af området.
- Punktets rute skal kunne gås med lygte på under 10 minutter.
- Admin skal altid kunne slukke alarmen fra telefonen med ét tryk.
