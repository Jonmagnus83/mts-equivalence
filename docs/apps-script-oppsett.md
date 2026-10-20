# Apps Script: lim inn, sett opp, publiser

Dette gjøres i Jons egen Google-konto. Ingen andre skal logge inn der. Nettstedet på GitHub Pages er statisk. Brukernavn og passord sjekkes bare i Apps Script.

Etterpå virker en deltakerlenke på en hvilken som helst PC:

`https://jonmagnus83.github.io/mts-equivalence/#/delta?k=KODEN`

Koden utløper etter 24 timer. Apps Script lagrer bare en SHA-256-hash av koden, et tilfeldig deltakernummer på minst fem sifre, og oppsettet. Flere deltakere kan kjøre samtidig. Hver kode er sin egen økt.

Resultatene legges i

`Min disk / Mennesker eller Boter-AI / <prosjekt> / <deltakernummer> / <deltakernummer>`

Mappen `Mennesker` eller `Boter-AI` velges på oppsettssiden. Google-arket har fanene Data, Parametere og Hendelser. Samme mappe får også `.xlsx` og `.csv` når nettleseren sender dem. En kopi lastes alltid ned lokalt i tillegg.

Kodelisten ligger i mappen `MTS-koder`, adskilt fra resultatene. Der står hashen, ikke koden.

Frakoblet fil (`dist-offline/index.html`, åpnet med `file://`) trenger ikke Apps Script. Da brukes **Start økt på denne maskinen**, og filene lastes ned lokalt. Deltakerlenken til en annen PC krever at skriptet er publisert og at adressen ligger i `public/lagring.json`.

## 1. Nytt prosjekt og lim inn koden

1. Åpne [script.google.com](https://script.google.com) mens du er logget inn som Jon.
2. Klikk **Nytt prosjekt**.
3. Gi prosjektet navnet `MTS-lab`.
4. Slett alt i `Code.gs`.
5. Lim inn hele filen `apps-script/Code.gs` fra dette repositoriet. Det skal være én fil.
6. Klikk lagre (diskett-ikonet eller Ctrl+S).

## 2. Sett brukernavn og passord

Ikke skriv passordet inn i koden, og ikke legg det i git.

1. Klikk tannhjulet **Prosjektinnstillinger**.
2. Under **Skriptegenskaper**, klikk **Legg til skriptegenskap**.
3. Egenskap `OPPSETT_BRUKERNAVN`, verdi: brukernavnet eksperimentatoren skal skrive på oppsettssiden.
4. Legg til en egenskap til: `OPPSETT_PASSORD`, verdi: et passord på minst 8 tegn.
5. Lagre egenskapene.
6. Gå tilbake til editoren. Velg funksjonen `installerEksperimentator` i nedtrekkslisten og klikk **Kjør**.
7. Godta tillatelsene Google spør om. Skriptet skal kunne bruke Drive for filene det selv lager.
8. Når kjøringen er ferdig, er passordet hashet med salt. Klartekstfeltene `OPPSETT_BRUKERNAVN` og `OPPSETT_PASSORD` er slettet. De skal ikke legges inn på nytt.

Vil du bytte passord senere, legger du inn de to egenskapene på nytt og kjører `installerEksperimentator` en gang til.

Valgfritt: egenskapen `ROOT_FOLDER_ID` hvis filene skal ligge i en annen mappe enn roten av Min disk. ID-en er den lange koden i adresselinjen når mappen er åpen.

## 3. Publiser web-appen

1. Klikk **Distribuer** → **Ny distribusjon**.
2. Velg typen **Nettapp** (tannhjulet ved siden av «Velg type» hvis listen er tom).
3. Beskrivelse: `MTS-lab`.
4. **Kjør som:** Meg.
5. **Hvem har tilgang:** Alle.
6. Klikk **Distribuer**.
7. Kopier nettadressen som slutter på `/exec`. Det er den eneste adressen som skal brukes. Ikke bruk adressen som slutter på `/dev`.

Deltakerne er ikke innlogget på Google, derfor må tilgangen være **Alle**. De kan bare åpne en kode som finnes, og levere resultater for den koden. De kan ikke lage koder eller lese andres filer. Det krever den korte økttokenen som innloggingen gir eksperimentatoren.

## 4. Legg adressen inn én gang

1. Åpne `https://jonmagnus83.github.io/mts-equivalence/#/oppsett`.
2. Lim `/exec`-adressen inn i feltet **Apps Script-adresse**.
3. Skriv brukernavn og passord fra steg 2 og klikk **Logg inn**.
4. Samme adresse må også ligge i filen `public/lagring.json` i repositoriet, slik at en annen PC finner skriptet uten å ha vært innom oppsettssiden:

```json
{
  "scriptUrl": "https://script.google.com/macros/s/…/exec",
  "middle": "Mennesker"
}
```

Filen inneholder ingen hemmelighet. Den som har tilgang til GitHub, lagrer filen og pusher til `main`. GitHub Pages publiserer den på nytt. Inntil den filen er oppdatert, kan adressen skrives inn i panelet på én maskin, men deltakerlenker på andre maskiner finner ikke skriptet.

5. Klikk **Test tilkobling**. Teksten skal si at tilkoblingen virker og at eksperimentatoren er satt opp.

## 5. Lag en deltakerlenke

1. Fyll inn parametrene på kort 1–3.
2. På kort 5 velger du **Mennesker** eller **Boter-AI**.
3. På kort 4 klikker du **Lagre eksperiment og hent lenke**.
4. Kopier lenken. Den ser slik ut:

`https://jonmagnus83.github.io/mts-equivalence/#/delta?k=ABCD-2345`

5. Hver nye deltaker trenger et nytt klikk, og får sin egen kode og sitt eget nummer. Koden virker i 24 timer.

**Hent resultatliste** viser deltakernumrene. **CSV** laster ned resultatfilen når økten er levert.

## 6. Når koden i Apps Script endres senere

1. Lim inn den nye `Code.gs` og lagre.
2. Klikk **Distribuer** → **Administrer distribusjoner**.
3. Velg blyanten ved web-appen.
4. Under **Versjon**, velg **Ny versjon**.
5. Klikk **Distribuer**.

`/exec`-adressen er den samme. Du trenger ikke ny lenke i `lagring.json` hvis adressen ikke har endret seg.

## 7. Frakoblet kjøring

`npm run build:offline` lager `dist-offline/index.html`. Filen åpnes fra en USB-pinne uten nett og uten innlogging. Bruk **Fortsett uten nett** hvis innloggingsskjermen vises, og deretter **Start økt på denne maskinen**. Resultatene lastes ned til maskinen. De sendes ikke til Drive.

## 8. Hvis noe feiler

- **Eksperimentator er ikke satt opp.** Kjør `installerEksperimentator` etter at brukernavn og passord er lagt inn som skriptegenskaper.
- **Feil brukernavn eller passord.** Egenskapene ble slettet da funksjonen kjørte. Bruk det passordet du satte, ikke et nytt, med mindre du kjører funksjonen på nytt.
- **Logg inn på nytt.** Økttokenen varer i seks timer. Logg inn igjen.
- **Tilkoblingen viser en innloggingsside for Google.** Distribusjonen er ikke satt til **Alle**, eller du limte inn `/dev`-adressen.
- **Lenken virker på din PC, men ikke på en annen.** `public/lagring.json` mangler `/exec`-adressen, eller den er ikke publisert til `main` ennå.
- **Ingen mappe i Drive.** Lagre et eksperiment mens du er innlogget, la en deltaker fullføre, og se etter `Mennesker` eller `Boter-AI` i roten av Min disk.
