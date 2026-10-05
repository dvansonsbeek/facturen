import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { beleidVoorOmgeving } from "@/lib/csp";
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
const description =
  "Maak gratis facturen en offertes met de Nederlandse btw-tarieven 21%, 9% en 0% "
  + "en ondersteuning voor de kleineondernemersregeling (KOR). Voor zzp'ers en kleine "
  + "bedrijven. Geen account en geen server: alles blijft in je eigen browser.";

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
      </body>
    </html>
  );
}
