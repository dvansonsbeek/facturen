import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { beleidVoorOmgeving } from "@/lib/csp";
import { HERKOMST, SITE_URL, NAAM } from "@/lib/site";
import VisitCounter from "@/components/VisitCounter";
import ServiceWorker from "@/components/ServiceWorker";
import ThemeApplier from "@/components/ThemeApplier";
import "./globals.css";

/**
 * next/font haalt deze lettertypes tijdens het bouwen op en zet ze bij de rest
 * van de site. Daardoor doet de pagina geen verzoek meer aan fonts.googleapis.com
 * bij het openen — dat stuurde het IP-adres van elke bezoeker naar Google,
 * terwijl de app belooft dat er niets naar buiten gaat.
 */
// Geen weight-lijst: dit zijn variabele lettertypes, die dekken het hele bereik
// in één bestand. Een expliciete lijst weigert de bundelaar bovendien.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

/**
 * metadataBase maakt de verwijzingen naar de deelafbeelding absoluut; zonder
 * basis zet Next er relatieve paden neer en daar kan een crawler niets mee.
 *
 * Hier hoort alléén het domein, zonder pad. Next plakt een eventueel basispad
 * zelf al voor de afbeeldingsroute, dus met een pad erin krijg je het twee keer
 * en laadt de deelafbeelding niet. Sinds de site op een eigen domein staat is er
 * geen basispad meer, maar de regel blijft gelden als dat ooit terugkomt. De
 * volledige URL van de site staat los, voor og:url.
 */
const origin = HERKOMST;
const siteUrl = SITE_URL;

/* Naam voorop, beschrijving erachter: zo staat er in een zoekresultaat zowel
   waarop iemand je terugzoekt als waarvoor het dient. */
const title = `${NAAM} — gratis facturen en offertes volgens Nederlandse btw-regels`;
/**
 * Wat een zoekresultaat laat zien, en dus waarop iemand besluit te klikken.
 *
 * Eerst wat het is, dan waarom het anders is. Dat laatste staat met opzet in
 * gevolgen en niet in eigenschappen: "privacyvriendelijk" zegt niemand iets,
 * "geen account, geen abonnement" wel.
 */
const description =
  "Facturen en offertes volgens de Nederlandse btw-regels, met KOR en e-factuur "
  + "(UBL/NLCIUS). Geen account, geen abonnement, geen server — je klantgegevens "
  + "blijven in je eigen browser.";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title,
  description,
  /* De eigen URL, zodat een zoekmachine weet welke de echte is. Dat weegt nu
     zwaarder dan anders: de site stond tot vandaag op
     dvansonsbeek.github.io/facturen en is daar waarschijnlijk geïndexeerd. De
     301 doet het meeste werk, maar dit zegt het nog eens met zoveel woorden. */
  alternates: { canonical: '/' },
  keywords: [
    "factuur maken", "gratis factuur", "factuurgenerator", "offerte maken",
    "zzp factuur", "btw", "KOR", "kleineondernemersregeling", "Nederland",
  ],
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: siteUrl,
    siteName: NAAM,
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

/**
 * Gestructureerde gegevens voor zoekmachines.
 *
 * In gewone tekst staat al dat het gratis is; dit zegt het in een vorm die een
 * zoekmachine kan gebruiken in plaats van moet raden. Voor een gratis app die
 * het opneemt tegen betaalde pakketten is dat het verschil tussen "staat ergens
 * in de tekst" en "is een eigenschap van dit product".
 *
 * Geen naam van een maker erin, net als in LICENSE: dat is een bewuste keuze en
 * geen omissie. De verwijzing naar de broncode doet hetzelfde werk.
 */
const gestructureerdeGegevens = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: NAAM,
  url: siteUrl,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Elke browser',
  inLanguage: 'nl-NL',
  description,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  license: 'https://opensource.org/licenses/MIT',
  codeRepository: 'https://github.com/dvansonsbeek/facturen',
  featureList: [
    'Facturen en offertes volgens de Nederlandse btw-tarieven (21%, 9%, 0%)',
    'Kleineondernemersregeling (KOR)',
    'E-factuur als UBL volgens NLCIUS (SI-UBL 2.0)',
    'Creditfacturen',
    'Betaal-QR volgens EPC069-12',
    'Werkt offline, zonder account en zonder server',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        {/* Zie lib/csp.ts voor wat dit beleid doet en waarom het tijdens
            ontwikkelen losser staat dan in de gepubliceerde versie. */}
        <meta httpEquiv="Content-Security-Policy" content={beleidVoorOmgeving()} />
        {/* Een gegevensblok en geen script dat draait: type ld+json wordt niet
            uitgevoerd. Het staat hier en niet in metadata, omdat Next daar geen
            plek voor heeft. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(gestructureerdeGegevens) }}
        />
      </head>
      <body>
        {/* Zet het thema op <html>, en wel op élke pagina. Stond eerder in
            InvoiceForm, waardoor de voorwaardenpagina altijd licht bleef. */}
        <ThemeApplier />
        {children}
        {/* Telt één bezoek met een afbeelding, niet met een script van buiten.
            Staat uit zonder NEXT_PUBLIC_GOATCOUNTER; zie lib/analytics.ts. */}
        <VisitCounter />
        {/* Laat de app ook zonder netwerk openen; zie public/sw.js. Staat uit
            buiten de gepubliceerde build, zodat de ontwikkelserver en de
            testsuite er niets van merken. */}
        <ServiceWorker />
      </body>
    </html>
  );
}
