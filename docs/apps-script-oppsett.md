# Apps Script: lagring i din egen Google Drive

Dette oppsettet gjør at resultatene fra nettversjonen skrives til **din** Google Drive. Appen lagrer ingen personopplysninger. Det som sendes til skriptet, er en SHA-256-hash av deltakerkoden, et tilfeldig deltakernummer på minst fem sifre, oppsettet og forsøksradene.

Mappene blir:

```text
Min disk / Mennesker eller Boter-AI / <prosjekt> / <deltakernummer> / <deltakernummer>
Min disk / Mennesker eller Boter-AI / <prosjekt> / <deltakernummer> / <deltakernummer>.csv
Min disk / Mennesker eller Boter-AI / <prosjekt> / <deltakernummer> / <deltakernummer>.xlsx
Min disk / Mennesker eller Boter-AI / <prosjekt> / <deltakernummer> / <deltakernummer>_hendelser.csv
```

`<deltakernummer>` uten etternavn er et Google-ark med fanene Data, Parametere og Hendelser. `.xlsx` er den samme filen som nettleseren lager. Prosjektmappen er studie-ID-en fra oppsettssiden.

På oppsettssiden, kort 5, velger du **Lagringsmappe**: `Mennesker` eller `Boter-AI`. Valget sendes med koden og med resultatfilene. Skriptet oppretter den mappen under Min disk. En skriptegenskap kan ikke overstyre valget.

Kodearket ligger for seg selv i `MTS-koder`, uavhengig av hvilken resultatmappe du valgte. Der står hashen, deltakernummeret, prosjektet, mappen og utløpstidspunktet. Selve koden står ikke der. Rader som er eldre enn 24 timer, slettes neste gang noen registrerer, løser inn eller sender inn data. Da slettes også oppsettsfilen som hørte til hashen.

En lokal kopi lastes alltid ned i nettleseren, også når opplastingen virker.

## 1. Opprett skriptet

1. Åpne [script.google.com](https://script.google.com) mens du er logget inn på Google-kontoen som eier Drive-mappen.
2. Velg **Nytt prosjekt**.
3. Gi prosjektet et navn, for eksempel `MTS-lab`.
4. Slett innholdet i `Code.gs` og lim inn filen `apps-script/Code.gs` fra dette repositoriet.
5. Velg tannhjulet **Prosjektinnstillinger**. Kryss av for at `appsscript.json` skal vises i editoren.
6. Åpne `appsscript.json` og lim inn innholdet fra `apps-script/appsscript.json`.

## 2. Legg inn hemmeligheten

1. I prosjektinnstillingene, under **Skriptegenskaper**, velg **Legg til skriptegenskap**.
2. Egenskap: `EXPERIMENTER_SECRET`. Verdi: et langt passord du finner på selv. Det brukes bare når du oppretter koder, ikke av deltakeren.
3. Valgfritt: `ROOT_FOLDER_ID` hvis filene skal ligge i en annen mappe enn roten av Min disk. Da er ID-en den lange koden i adresselinjen når mappen er åpen i Drive.
4. Lagre.

Skriv hemmeligheten ned et sted du har kontroll på. Den skal ikke legges i git, i `lagring.json` eller i en deltakerlenke.

## 3. Publiser web-appen

1. Velg **Distribuer** → **Ny distribusjon**.
2. Type: **Nettapp**.
3. Kjør som: **Meg**.
4. Hvem har tilgang: **Alle** (også personer som ikke er logget inn). Deltakerne har ikke Google-konto i forsøket, så tilgangen må være åpen. Hemmeligheten beskytter registrering av nye koder. Innlevering krever en gyldig, uutsatt hash.
5. Distribuer, og godta tillatelsene Drive ber om. Skriptet skal kunne opprette og endre filer som det selv lager.
6. Kopier nettadressen som slutter på `/exec`.

Hver gang du endrer `Code.gs`, må du lage en **ny distribusjon** (eller redigere den eksisterende og velge ny versjon). Ellers kjører den gamle koden.

## 4. Koble adressen til MTS-lab

1. Åpne oppsettssiden.
2. Lim nettadressen inn i feltet **Apps Script-adresse**.
3. Lim hemmeligheten inn i feltet **Hemmelighet**. Den blir bare liggende i denne nettleserens lokale lager, ikke i oppsettsfilen.
4. Velg **Lagringsmappe**: Mennesker eller Boter-AI.
5. Velg **Test tilkobling**. Siden skal svare at tilkoblingen virker, og at hemmeligheten er gjenkjent.
6. Velg **Generer deltakerkode**. I Drive skal du se `MTS-koder`, og etter en ferdig økt mappen du valgte.

Deltakere som bruker en annen maskin, må nå den samme adressen. Den følger ikke med koden.

1. Velg **Last ned lagring.json** på oppsettssiden.
2. Legg filen i `public/lagring.json` i repositoriet. Den inneholder bare nettadressen og mappenavnet, ikke hemmeligheten.
3. Bygg og publiser på nytt (`npm run build`, deretter GitHub Pages).

Uten `lagring.json` virker koder likevel i nettleseren der de ble laget, fordi den nettleseren husker dem lokalt.

## 5. Slik ser en økt ut

1. Du genererer en kode. Deltakeren får koden eller lenken `#/kode/XXXX-XXXX`.
2. Koden virker i 24 timer. Når økten er markert ferdig, kan den ikke brukes til en ny økt.
3. Deltakeren kan fortsette en uferdig økt i samme nettleser. På en annen maskin starter koden økten på nytt så lenge den ikke er ferdig og ikke er utløpt.
4. Når økten er ferdig, ligger arket, CSV-filen og XLSX-filen i deltakerens mappe. Samme filer lastes ned lokalt.

## 6. Frakoblet kjøring

Apps Script brukes ikke når filen åpnes fra en USB-pinne. Da velger du **Start økt på denne maskinen**, og resultatene lastes ned som fil. Se README.

## 7. Hvis noe feiler

- **Hemmeligheten stemmer ikke.** Egenskapen og feltet på oppsettssiden må være like, uten mellomrom på slutten.
- **Tilkoblingen svarer med en innloggingsside.** Distribusjonen er ikke satt til «Alle», eller du åpnet redigeringsadressen (`/dev`) i stedet for `/exec`.
- **Ingen mappe i Drive.** Test tilkoblingen, generer en kode, og se i roten av Min disk etter `Mennesker`. En annen `ROOT_FOLDER_ID` flytter hele treet.
- **Opplastingen feiler etter en gyldig kode.** Den lokale XLSX-filen er likevel lastet ned. Det er den som gjelder hvis Drive ikke fikk filen.
- **Store bilder.** Oppsett med mange innebygde data-URL-er kan bli for store for ett kall. Bruk det innebygde symbolsettet på nett, eller kjør økten frakoblet.
