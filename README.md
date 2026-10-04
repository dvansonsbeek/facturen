# Facturen 🚀

Facturen is een razendsnelle, privacy-vriendelijke web-applicatie voor het genereren van professionele facturen en offertes, specifiek ontworpen voor de Nederlandse markt.

## ✨ Features

- **Facturen & Offertes**: Schakel eenvoudig tussen het maken van een factuur of een offerte.
- **Nederlandse btw**: Tarieven van 21%, 9% en 0%, plus ondersteuning voor de kleineondernemersregeling (KOR). Staat de vrijstelling aan, dan laat de app alle btw-tarieven en -bedragen weg en voegt de vermelding toe (art. 25 Wet OB 1968).
- **Bedrijfsgegevens**: Velden voor btw-identificatienummer en KvK-nummer. Ze verschijnen alleen op het document als je ze invult.
- **Live Preview**: Bekijk direct hoe je document eruit ziet terwijl je typt.
- **PDF Export**: Download je document als een echte PDF op A4-formaat, met selecteerbare en doorzoekbare tekst.
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
- **PDF Generatie**: [@react-pdf/renderer](https://react-pdf.org/)
- **Type Safety**: TypeScript
- **Tests**: [Playwright](https://playwright.dev/)

## 🚀 Aan de slag

### Installatie

1. Clone de repository:
   ```bash
   git clone <repository-url> facturen
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

1. **Bedrijfsgegevens**: Vul je eigen gegevens in bij de sectie "Mijn Bedrijfsgegevens", inclusief je btw-identificatienummer en KvK-nummer.
2. **Bespaar Tijd**: Klik op de **Export** knop om je gegevens op te slaan als een `.json` bestand. Bij een volgend bezoek kun je dit bestand simpelweg **Importeren**.
3. **Opstellen**: Voeg items toe, geef ze een naam en een uitgebreide beschrijving. Pas aantallen en prijzen aan.
4. **BTW**: Schakel de KOR-modus in als je bent vrijgesteld van btw. De app laat dan alle btw-tarieven en -bedragen weg en voegt de vermelding van de vrijstelling toe.
5. **Afronden**: Vul eventueel betalingsvoorwaarden en opmerkingen in; die komen onderaan het document te staan.
6. **Downloaden**: Zodra je tevreden bent met het live voorbeeld, klik je op **Download PDF**.

## 📄 Licentie

Dit project is beschikbaar onder de MIT-licentie. Zie [LICENSE](LICENSE) voor de volledige tekst.

Facturen is een aangepaste versie van [factuurr](https://github.com/eraycode/factuurr)
van Eray, oorspronkelijk gemaakt voor de Belgische markt. Deze versie is aangepast aan
de Nederlandse btw-regelgeving.
