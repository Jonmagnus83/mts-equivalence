# MTS-lab

Nettleserprogram for matching-to-sample og stimulusekvivalens. Eksperimentatoren setter opp forsøket. Deltakeren ser en hvit skjerm, klikker én gang for å starte, og møter bare oppgaven.

Deltakersiden er på norsk. Engelsk kan velges på skjermen. Det samles ingen personopplysninger, og det er ingen analyseverktøy eller sporere fra tredjeparter.

## Kjøre lokalt

```bash
npm install
npm test
npm run dev
```

Åpne adressen Vite skriver ut. Oppsettet ligger på `#/oppsett`, deltakeren på `#/deltaker`, og symbolene på `#/symboler`.

`npm test` sjekker trialgeneratoren (struktur, kriterium, nedtrapping, testblanding, hjørner) og at eksporten har Data, Parametere og Hendelser. `npm run build` lager nettversjonen i `dist/`.

## Slik settes et forsøk opp

1. Velg studie-ID. Den blir prosjektmappen i Drive. På kort 5 velger du lagringsmappen Mennesker eller Boter-AI. Valget sendes til Apps Script.
2. Velg klasser (2–4, standard 3) og medlemmer per klasse (3–8, standard 3).
3. Velg LS, OTM eller MTO. Relasjoner, symmetri, transitivitet og ekvivalens regnes ut fra strukturen.
4. La mestringskriteriet stå på 17/18. Blokken gjentas med ny rekkefølge og nye posisjoner til kriteriet er nådd.
5. Nedtrappingen er 100, 75, 50 og 0 prosent. Andelen rundes til nærmeste hele forsøk, så 75 prosent av 18 er 14. Nedtrappingen gjelder riktige svar. «Feil» følger innstillingen under og trappes ikke ned.
6. Standard etter feil er litteraturinnstillingen: ordet «Feil» i 2 sekunder, og korreksjon er på. Samme relasjon gjentas til svaret er riktig, eller til maksgrensen. Det første feilsvaret teller fortsatt med i kriteriet.
7. Presentasjonen er simultan. Forsinket MTS skjuler utvalget og venter det antall sekunder du setter. ITI er 0,1 sekunder. Ett klikk på utvalget kreves. 0 klikk viser utvalg og sammenligninger samtidig.
8. Med tre klasser står sammenligningene i tre av fire hjørner. Det tomme hjørnet og hjørnet for riktig svar balanseres i blokken, og riktig svar kan ikke ligge i samme hjørne mer enn to ganger på rad. Med to klasser er to hjørner tomme. Med fire klasser brukes alle fire.
9. Testen blander symmetri, transitivitet og ekvivalens. Baseline i testen og refleksivitet er av. Test-multiplikatoren er 3. Siden viser hva «over 95 prosent» betyr i antall, og også 17/18-kriteriet fra litteraturen.
10. **Lagre oppsett (JSON)** og **Last oppsett** flytter oppsettet mellom maskiner. Filen inneholder ikke deltakerkoder.

Instruksjonen kan redigeres. Den bør ikke si at figurene «hører sammen». Standardteksten sier at fanen ikke skal lukkes, og at hjelpemidler ikke er tillatt: mobil, notater, skriving og andre personer.

## Deltakeren

Ett klikk hvor som helst på instruksjonsskjermen ber om fullskjerm og starter forsøket. Nettleseren viser sitt eget varsel hvis deltakeren prøver å lukke eller laste siden på nytt. Programmet kan ikke legge inn sin egen tekst i det varselet.

Hvis deltakeren bytter fane, mister fokus eller avslutter fullskjerm, logges hendelsen med tidspunkt og varighet, og økten pauses til deltakeren klikker seg tilbake. Antall fanebytter så langt ligger på hver forsøksrad. Hendelsene ligger i fanen Hendelser.

**Ærlig grense.** En nettleser kan ikke hindre at fanen lukkes, og den kan ikke se en mobil, et notat eller en annen skjerm. Programmet kan varsle, oppdage og logge. Det er alt.

## Innlogging og koder

Oppsettssiden ber om brukernavn og passord. De sjekkes i Apps Script, ikke i den statiske siden. Passordet lagres aldri i git. Deltakeren trenger ikke passordet.

**Lagre eksperiment og hent lenke** lagrer oppsettet i Apps Script og viser en lenke:

`https://jonmagnus83.github.io/mts-equivalence/#/delta?k=ABCD-2345`

Koden utløper etter 24 timer. Apps Script lagrer bare en hash, og trekker et deltakernummer på minst fem sifre. Samme lenke åpner det samme eksperimentet på en annen PC. Flere deltakere kan kjøre samtidig.

Uten Apps Script virker bare **Start økt på denne maskinen**. Det er også veien for den frakoblede filen. Se [docs/apps-script-oppsett.md](docs/apps-script-oppsett.md).

## Resultatfilene

Filene heter `<deltakernummer>.xlsx` og `<deltakernummer>.csv`. Excel-filen har fanene Data, Parametere, Hendelser og Oppsummering. CSV-filen er Data-fanen med UTF-8 BOM og semikolon, slik at norsk Excel viser æ, ø og å og deler kolonnene. Parametrene ligger både i fanen Parametere og som `par_`-kolonner på hver rad. `<deltakernummer>_hendelser.csv` er hendelsesloggen.

Nedlastingen skjer alltid på deltakerens maskin. Opplasting til Drive kommer i tillegg når Apps Script er satt opp.

## Symboler

`#/symboler` viser de 32 innebygde figurene. De er svarte, asymmetriske og laget for ikke å ligne bokstaver, tall eller kjente tegn. Se gjennom dem og huk av **Utelat** på dem som likevel gjør det. Valget lagres i oppsettet. Du kan også laste opp egne bilder per stimulus, og du kan la ett medlemssett (ofte C) være bilder.

## Frakoblet fil (USB)

```bash
npm run build:offline
```

Filen `dist-offline/index.html` inneholder skript, stil og symboler. Kopier den til en USB-pinne og åpne den i Chrome, Edge eller Firefox med `file://`. Ingen installasjon og ingen nettforbindelse. Velg **Start økt på denne maskinen**, eller last inn en JSON-fil du har lagret tidligere. Når økten er ferdig, lastes resultatene ned til maskinen. Koder og Apps Script brukes ikke.

Noen nettlesere spør før de tillater flere nedlastinger. Excel-filen kommer først. Knappene på sluttskjermen henter filene på nytt hvis en av dem ble stoppet.

## GitHub Pages

Arbeidsflyten ligger i `.github/workflows/pages.yml`. Den kjører testene, bygger med base-adresse `/mts-equivalence/` og laster opp `dist/`.

Arbeidsflyten prøver å slå på Pages selv (`actions/configure-pages` med `enablement: true`). `GITHUB_TOKEN` får ikke lov til å opprette nettstedet. Første gang må en administrator sette **Settings → Pages → Source: GitHub Actions**, eller gi arbeidsflyten et token som ikke er `GITHUB_TOKEN`, med `pages: write` og `administration: write`. Etter det deployer arbeidsflyten selv til `https://jonmagnus83.github.io/mts-equivalence/`.

Før den adressen deles med deltakere: legg Apps Script-adressen i `public/lagring.json` og bygg på nytt, hvis resultatene skal til Drive. Hemmeligheten skal ikke stå i den filen.

## Analyse

```bash
python3 analysis/analyze_mts.py sti/til/10427.csv --out analyse
```

Skriptet bruker bare Python-standardbiblioteket. Det skriver nøyaktighet per blokk, nøyaktighet per relasjonstype i testen, en ensidig binomialtest mot sjanse (1/antall klasser), og nøyaktighet betinget av hvilket hjørne som var riktig. Figurene er SVG-filer i `analyse/figurer/`.

## Personvern

Ingen navn, e-post, IP-adresse eller nettleserdetaljer skrives i resultatfilen. Deltakernummeret er tilfeldig. Google, GitHub og nettleseren kan likevel se IP-adresser i sine egne logger. Det bør avklares med personvernombudet før forsøket brukes med deltakere.
