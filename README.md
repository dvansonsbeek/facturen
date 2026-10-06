# Facturen 🚀

**➡️ Direct gebruiken: [dvansonsbeek.github.io/facturen](https://dvansonsbeek.github.io/facturen/)**

Facturen is een razendsnelle, privacy-vriendelijke web-applicatie voor het genereren van professionele facturen en offertes, specifiek ontworpen voor de Nederlandse markt.

Je hoeft niets te installeren en niets aan te maken: open de link en begin. Er is geen server, dus alles wat je invult blijft in je eigen browser.

> *In English: a client-side invoice and quotation generator for the Dutch market — Dutch VAT rates (21/9/0%), the six Dutch VAT treatments (standard, small-business exemption, reverse charge, intra-EU supply, export, zero rate), KvK and VAT numbers, selectable-text PDF export, and e-invoicing as UBL/NLCIUS validated against the official Schematron. No backend, no accounts; everything stays in the browser. The interface and the rest of this README are in Dutch, because its users are.*

## ✨ Features

- **Facturen & Offertes**: Schakel eenvoudig tussen het maken van een factuur of een offerte.
- **Nederlandse btw**: Tarieven van 21%, 9% en 0%, plus vijf btw-behandelingen: normaal, de kleineondernemersregeling (KOR), btw verlegd, intracommunautaire levering en uitvoer buiten de EU. Bij alles behalve normaal laat de app de btw-bedragen weg en zet hij de juiste vermelding op het document — *0% zonder reden erbij is geen complete factuur* — en krijgt de e-factuur de bijbehorende UBL-categorie (`E`, `AE`, `K` of `G`). Een gewoon nultarief kies je niet apart: dat is het normale regime met 0% per regel, want dan hoort het tarief juist wél op de factuur te staan.
- **Bedrijfsgegevens**: Velden voor btw-identificatienummer en KvK-nummer. Ze verschijnen alleen op het document als je ze invult.
- **Regels met een eenheid**: Reken per **uur**, per **stuk**, per **dag**, per **km** of helemaal zonder eenheid voor een vast bedrag. Je mag ook je eigen eenheid typen.
- **Doorlopende nummering**: De app onthoudt waar je gebleven was. **Volgende factuur** hoogt het nummer op en maakt het document leeg; het jaartal rolt vanzelf mee.
- **Offerte omzetten**: Een geaccepteerde offerte wordt met één klik een factuur, met klant en regels en een verwijzing naar het offertenummer.
- **Live Preview**: Bekijk direct hoe je document eruit ziet terwijl je typt.
- **PDF Export**: Download je document als een echte PDF op A4-formaat, met selecteerbare en doorzoekbare tekst. Bij meerdere pagina's staan de betaalinstructies onderaan elke pagina en wordt er genummerd ("pagina 1 van 2").
- **E-factuur (UBL)**: Download dezelfde factuur als machineleesbaar UBL-bestand volgens **NLCIUS** (SI-UBL 2.0), de Nederlandse uitvoering van de Europese norm EN 16931. Dat is wat de administratie van je klant kan inlezen, en wat de Rijksoverheid verplicht stelt. Vul daarvoor je KvK- en btw-nummer in, plus een referentie van je klant; het KvK-nummer van je klant is optioneel en nodig om het bestand via Peppol te laten versturen.
- **Logo Support**: Upload je eigen bedrijfslogo voor een professionele uitstraling op al je documenten.
- **Gegevens Onthouden**: Je bedrijfs- en betaalgegevens worden bewaard in je eigen browser, op dit apparaat. Je vult ze één keer in; met **Wissen** haal je ze er weer uit.
- **Klantenboek**: Bewaar je klanten en kies ze de volgende keer uit een lijst. De velden klappen dan dicht; met **Bewerken** open je ze weer. Wat je aanpast verandert de bewaarde klant pas als je **Opslaan** gebruikt.
- **Documenten Bewaren**: Leg een factuur of offerte vast met **Bewaren**. Een bewaard document staat vast — het bevat je bedrijfs- en betaalgegevens zoals ze op dat moment waren en is daarna niet meer te wijzigen, want je klant heeft hem al. Je kunt hem bekijken, opnieuw als PDF downloaden, of met **Dupliceren** de klant en regels overnemen in een nieuw concept.
- **Instellingen Meenemen**: Exporteer en importeer je gegevens én je bewaarde documenten via een JSON-bestand om ze naar een ander apparaat of een andere browser over te zetten. Dat bestand is ook je reservekopie. Is je archief versleuteld, dan is het bestand dat ook.
- **Optionele Wachtwoordzin**: Zet een zin op je gegevens en je bewaarde documenten én je klantenboek gaan versleuteld naar schijf (AES-256-GCM). De app legt bij **Beveiliging en privacy** uit waar je gegevens staan, waar het risico zit en wat een wachtwoordzin wel en niet oplost.
- **Opgeruimd Formulier**: Secties die je maar één keer invult, klap je in; die keuze wordt onthouden.
- **Dark Mode**: Oogvriendelijk ontwerp voor de late uurtjes.
- **Responsief**: Werkt op desktop, tablet en telefoon.
- **Privacy First**: Geen database, geen cloud-opslag, geen trackers. Al je gegevens blijven in je eigen browser — en dat is afgedwongen, niet alleen beloofd: de pagina stuurt een beveiligingsbeleid mee dat de browser verbiedt om ook maar één verzoek naar buiten te doen. De lettertypes komen daarom uit de app zelf en niet bij Google vandaan.

## ⚠️ Goed om te weten

- **Geen boekhouding.** De app bewaart je documenten wél, maar telt ze niet op: hij houdt je omzet niet bij tegen de KOR-grens van € 20.000 per kalenderjaar en doet geen aangifte.
- **Het risico zit in dit apparaat, niet in het netwerk.** Er gaat niets naar buiten, maar wie bij dit browserprofiel kan, kan standaard bij je bewaarde documenten en je klanten. Met een **wachtwoordzin** (zie *Beveiliging en privacy* in de app) gaan die versleuteld naar schijf. Je eigen bedrijfsgegevens en factuurnummers blijven bewust leesbaar: die staan op elke factuur die je verstuurt en in het handelsregister, en zo blijft de app bruikbaar zonder de zin. Een wachtwoordzin beschermt wat er stilstaat — niet een sessie die al open is, en niet tegen een kwaadwillende browserextensie. Vergeet je de zin, dan zijn je archief en klantenboek weg: er is geen herstelcode.
- **Factuurnummers: onthouden, niet bewaakt.** De app onthoudt waar je gebleven was en hoogt het nummer op als je op **Volgende factuur** klikt. Hij controleert niets: je blijft zelf verantwoordelijk voor een kloppende reeks. Factureer je vanaf twee apparaten, dan lopen er twee reeksen naast elkaar en kunnen er dubbele nummers ontstaan.
- **Onthouden is per browser en per apparaat.** Je bedrijfsgegevens en je bewaarde documenten staan in de opslag van deze browser: je laptop en je telefoon delen ze niet, en het wissen van je browsergegevens haalt ze weg. Op een gedeelde computer blijven ze achter tot je op **Wissen** klikt. Gebruik Export als reservekopie — het is de enige kopie die je hebt.
- **Btw wordt per tarief berekend en op centen afgerond**, zodat de getoonde btw-regels altijd optellen tot het getoonde totaal.
- **Het voorbeeld, de PDF en de e-factuur zijn drie weergaven.** Het scherm is HTML, de PDF wordt apart opgebouwd, de e-factuur is XML. De btw-opstelling delen ze alle drie, en de end-to-end tests vergelijken de bedragen met elkaar, zodat ze niet ongemerkt uit elkaar lopen.
- **De e-factuur gaat door de officiële validator.** Bij elke commit worden drie varianten — twee btw-tarieven, vrijgesteld en nultarief — door de Schematron van de Nederlandse Peppolautoriteit gehaald (SI-UBL 2.0); die toetst 86 regels. Eén ding kan die validator níet zien: of een factuur vrijgesteld is (`E`) of onder het nultarief valt (`Z`). Beide zijn geldige UBL, en welke van de twee klopt is een vraag over de Wet OB. Dat deel blijft dus door de eigen tests gedekt.

## 🛠️ Technologie

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router) met React 19
- **Styling**: Vanilla CSS met een gepersonaliseerd Premium Design System.
- **Icons**: [Lucide React](https://lucide.dev/)
- **PDF Generatie**: [@react-pdf/renderer](https://react-pdf.org/), met [pdf-lib](https://pdf-lib.js.org/) voor de paginanummering
- **Type Safety**: TypeScript
- **Tests**: [Playwright](https://playwright.dev/)

## 🚀 Aan de slag

De gepubliceerde versie staat op **[dvansonsbeek.github.io/facturen](https://dvansonsbeek.github.io/facturen/)**; elke push naar `main` publiceert hem opnieuw, mits de tests slagen. Hieronder staat hoe je hem lokaal draait.

### Installatie

1. Clone de repository:
   ```bash
   git clone https://github.com/dvansonsbeek/facturen.git
   cd facturen
   ```

2. Installeer de benodigde pakketten:
   ```bash
   npm install
   ```

3. Start de ontwikkelomgeving:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in je browser om de app te gebruiken.

### Tests

De end-to-end tests draaien tegen de echte app en starten zelf een dev-server.
Eenmalig de browser installeren, daarna:

```bash
npx playwright install chromium
npm test
```

Daarnaast is er een UAT-reis die één keer de hele weg aflegt die een gebruiker
aflegt — bedrijf invullen, twee klanten factureren, er een weggooien, een
offerte omzetten, alles versleutelen, ontgrendelen en opruimen. Die draait
tegen de **gepubliceerde build**, want een statische export is een ander pad
dan de dev-server:

```bash
npm run build && npm run test:uat
```

Of tegen de echt gepubliceerde site. Dat kan zonder bijwerking: er is geen
server en geen account, dus alles wat de reis aanmaakt staat in de browser van
de test en verdwijnt ermee.

```bash
UAT_BASE_URL=https://dvansonsbeek.github.io/facturen/ npm run test:uat
```

En de e-factuur gaat door de officiële validator van de Nederlandse
Peppolautoriteit. Dat is een XSLT 2.0-stylesheet, dus hiervoor is een JRE nodig
(`apt install default-jre`); de validator en Saxon worden op een vaste versie
opgehaald en staan niet in de repo.

```bash
npm run build && npm run check:efactuur
```

Dat draait allemaal bij elke commit: de suites, de UAT-reis en de
e-factuurcontrole op de build vóór publicatie, en de reis daarna nog eens op de
site zelf.

## 📝 Gebruik

1. **Bedrijfsgegevens**: Vul je eigen gegevens in bij "Mijn Bedrijfsgegevens", inclusief je btw-identificatienummer en KvK-nummer, en je rekeningnummer bij "Mijn Betaalgegevens". Dat hoeft maar één keer: de app onthoudt ze. Klap de secties daarna in.
2. **Klant**: Kies een klant uit de lijst, of laat hem op "Nieuwe klant" staan en typ de gegevens. Met **Opslaan** komt hij in je klantenboek en kun je hem de volgende keer zo kiezen.
3. **Opstellen**: Voeg regels toe met een naam, een omschrijving, een aantal en eventueel een eenheid (uur, stuk, dag). Kies per regel het btw-tarief.
4. **BTW**: Kies bij **Btw-behandeling** wat er geldt: normaal, de kleineondernemersregeling, btw verlegd, een intracommunautaire levering of uitvoer buiten de EU. Bij alles behalve normaal laat de app de btw-bedragen weg en zet hij de vermelding die erbij hoort op het document — want 0% zonder reden erbij is geen complete factuur. Een gewoon nultarief hoort bij *normaal*: kies dan 0% per regel, zodat het tarief op de factuur blijft staan.
5. **Datum levering/dienst**: Vul die alleen in als je werk op een andere datum geleverd is dan de factuurdatum, bijvoorbeeld als je achteraf factureert. Hij komt dan op de factuur, want dat is dan verplicht (art. 35a lid 1 Wet OB 1968).
6. **Afronden**: Vul eventueel betalingsvoorwaarden en opmerkingen in; die komen onderaan het document te staan.
7. **Downloaden**: Zodra je tevreden bent met het live voorbeeld, klik je op **Download PDF**. Voor een zakelijke klant kun je daarnaast **E-factuur (UBL)** gebruiken.
8. **Volgende**: Klik op **Volgende factuur** om het nummer op te hogen en met een leeg document verder te gaan. Je klant blijft staan, want die factureer je vaker.

Werk je op meerdere apparaten? Gebruik **Export** en **Import** om je bedrijfsgegevens, klantenboek en nummering mee te nemen.

## 📄 Licentie

Dit project is beschikbaar onder de MIT-licentie. Zie [LICENSE](LICENSE) voor de volledige tekst.

Facturen is een aangepaste versie van [factuurr](https://github.com/eraycode/factuurr)
van Eray, oorspronkelijk gemaakt voor de Belgische markt. Deze versie is aangepast aan
de Nederlandse btw-regelgeving.
