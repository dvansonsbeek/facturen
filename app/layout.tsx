import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { beleidVoorOmgeving } from "@/lib/csp";
import VisitCounter from "@/components/VisitCounter";
import ServiceWorker from "@/components/ServiceWorker";
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
 * Let op: hier hoort alléén het domein, zonder /facturen. Next plakt het
 * basispad zelf al voor de afbeeldingsroute, dus met het pad erin krijg je
 * .../facturen/facturen/opengraph-image.png en laadt de deelafbeelding niet.
 * De volledige URL van de site staat los, voor og:url.
 */
const origin = "https://dvansonsbeek.github.io";
const siteUrl = `${origin}${process.env.PAGES_BASE_PATH ?? ''}/`;

const title = "Facturen & Offertes — gratis factuur maken volgens Nederlandse btw-regels";
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
  keywords: [
    "factuur maken", "gratis factuur", "factuurgenerator", "offerte maken",
    "zzp factuur", "btw", "KOR", "kleineondernemersregeling", "Nederland",
  ],
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: siteUrl,
    siteName: "Facturen & Offertes",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
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
      </head>
      <body>
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
