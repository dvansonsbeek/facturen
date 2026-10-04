import type { NextConfig } from "next";

/**
 * De app draait volledig in de browser en heeft geen server nodig, dus hij gaat
 * als statische export naar GitHub Pages.
 *
 * Een Pages-projectsite staat onder /<reponaam>, dus daar moeten basePath en
 * assetPrefix op staan, anders zoekt de pagina haar bestanden in de root en
 * laadt ze zonder opmaak. Maar het geldt alléén voor die publicatie-build:
 * zet je het hier vast, dan serveert ook `next dev` op /facturen en wacht de
 * testsuite zich suf op een 200 van de root. Vandaar via de omgeving, gezet
 * in .github/workflows/pages.yml. Verhuist de site naar een eigen domein, dan
 * laat je die variabele simpelweg weg.
 */
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
};

export default nextConfig;
