# Facturen 🚀

**➡️ Direct gebruiken: [dvansonsbeek.github.io/facturen](https://dvansonsbeek.github.io/facturen/)**

Facturen is een razendsnelle, privacy-vriendelijke web-applicatie voor het genereren van professionele facturen en offertes, specifiek ontworpen voor de Nederlandse markt.

Je hoeft niets te installeren en niets aan te maken: open de link en begin. Er is geen server, dus alles wat je invult blijft in je eigen browser.

> *In English: a client-side invoice and quotation generator for the Dutch market — Dutch VAT rates (21/9/0%), small-business exemption (KOR), KvK and VAT numbers, and selectable-text PDF export. No backend, no accounts; everything stays in the browser. The interface and the rest of this README are in Dutch, because its users are.*

## ✨ Features

- **Facturen & Offertes**: Schakel eenvoudig tussen het maken van een factuur of een offerte.
- **Nederlandse btw**: Tarieven van 21%, 9% en 0%, plus ondersteuning voor de kleineondernemersregeling (KOR). Staat de vrijstelling aan, dan laat de app alle btw-tarieven en -bedragen weg en voegt de vermelding toe (art. 25 Wet OB 1968).
- **Bedrijfsgegevens**: Velden voor btw-identificatienummer en KvK-nummer. Ze verschijnen alleen op het document als je ze invult.
- **Regels met een eenheid**: Reken per **uur**, per **stuk**, per **dag**, per **km** of helemaal zonder eenheid voor een vast bedrag. Je mag ook je eigen eenheid typen.
- **Doorlopende nummering**: De app onthoudt waar je gebleven was. **Volgende factuur** hoogt het nummer op en maakt het document leeg; het jaartal rolt vanzelf mee.
- **Offerte omzetten**: Een geaccepteerde offerte wordt met één klik een factuur, met klant en regels en een verwijzing naar het offertenummer.
- **Live Preview**: Bekijk direct hoe je document eruit ziet terwijl je typt.
- **PDF Export**: Download je document als een echte PDF op A4-formaat, met selecteerbare en doorzoekbare tekst. Bij meerdere pagina's staan de betaalinstructies onderaan elke pagina en wordt er genummerd ("pagina 1 van 2").
- **Logo Support**: Upload je eigen bedrijfslogo voor een professionele uitstraling op al je documenten.
- **Gegevens Onthouden**: Je bedrijfs- en betaalgegevens worden bewaard in je eigen browser, op dit apparaat. Je vult ze één keer in; met **Wissen** haal je ze er weer uit.
- **Klantenboek**: Bewaar je klanten en kies ze de volgende keer uit een lijst. De velden klappen dan dicht; met **Bewerken** open je ze weer. Wat je aanpast verandert de bewaarde klant pas als je **Opslaan** gebruikt.
- **Instellingen Meenemen**: Exporteer en importeer die gegevens via een JSON-bestand om ze naar een ander apparaat of een andere browser over te zetten.
- **Opgeruimd Formulier**: Secties die je maar één keer invult, klap je in; die keuze wordt onthouden.
- **Dark Mode**: Oogvriendelijk ontwerp voor de late uurtjes.
- **Responsief**: Werkt op desktop, tablet en telefoon.
- **Privacy First**: Geen database, geen cloud-opslag. Al je gegevens blijven 100% in je eigen browser.

## ⚠️ Goed om te weten

- **Geen boekhouding.** De app bewaart geen documenten en houdt je omzet niet bij tegen de KOR-grens van € 20.000 per kalenderjaar.
- **Factuurnummers: onthouden, niet bewaakt.** De app onthoudt waar je gebleven was en hoogt het nummer op als je op **Volgende factuur** klikt. Hij controleert niets: je blijft zelf verantwoordelijk voor een kloppende reeks. Factureer je vanaf twee apparaten, dan lopen er twee reeksen naast elkaar en kunnen er dubbele nummers ontstaan.
- **Onthouden is per browser en per apparaat.** Je bedrijfsgegevens staan in de opslag van deze browser: je laptop en je telefoon delen ze niet, en het wissen van je browsergegevens haalt ze weg. Op een gedeelde computer blijven ze achter tot je op **Wissen** klikt. Gebruik Export als reservekopie.
- **Btw wordt per tarief berekend en op centen afgerond**, zodat de getoonde btw-regels altijd optellen tot het getoonde totaal.
- **Het voorbeeld en de PDF zijn twee weergaven.** Het scherm is HTML, de PDF wordt apart opgebouwd. De btw-opstelling delen ze, en de end-to-end tests vergelijken de tekst van de PDF met die van het voorbeeld, zodat ze niet ongemerkt uit elkaar lopen.

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

## 📝 Gebruik

1. **Bedrijfsgegevens**: Vul je eigen gegevens in bij "Mijn Bedrijfsgegevens", inclusief je btw-identificatienummer en KvK-nummer, en je rekeningnummer bij "Mijn Betaalgegevens". Dat hoeft maar één keer: de app onthoudt ze. Klap de secties daarna in.
2. **Klant**: Kies een klant uit de lijst, of laat hem op "Nieuwe klant" staan en typ de gegevens. Met **Opslaan** komt hij in je klantenboek en kun je hem de volgende keer zo kiezen.
3. **Opstellen**: Voeg regels toe met een naam, een omschrijving, een aantal en eventueel een eenheid (uur, stuk, dag). Kies per regel het btw-tarief.
4. **BTW**: Schakel de KOR-modus in als je bent vrijgesteld van btw. De app laat dan alle btw-tarieven en -bedragen weg en voegt de vermelding van de vrijstelling toe.
5. **Afronden**: Vul eventueel betalingsvoorwaarden en opmerkingen in; die komen onderaan het document te staan.
6. **Downloaden**: Zodra je tevreden bent met het live voorbeeld, klik je op **Download PDF**.
7. **Volgende**: Klik op **Volgende factuur** om het nummer op te hogen en met een leeg document verder te gaan. Je klant blijft staan, want die factureer je vaker.

Werk je op meerdere apparaten? Gebruik **Export** en **Import** om je bedrijfsgegevens, klantenboek en nummering mee te nemen.

## 📄 Licentie

Dit project is beschikbaar onder de MIT-licentie. Zie [LICENSE](LICENSE) voor de volledige tekst.

Facturen is een aangepaste versie van [factuurr](https://github.com/eraycode/factuurr)
van Eray, oorspronkelijk gemaakt voor de Belgische markt. Deze versie is aangepast aan
de Nederlandse btw-regelgeving.
