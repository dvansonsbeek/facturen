import type { NextConfig } from "next";

/**
 * De app draait volledig in de browser en heeft geen server nodig, dus hij gaat
 * als statische export naar GitHub Pages.
 *
 * basePath en assetPrefix moeten gelijk zijn aan het pad waarop Pages de site
 * serveert: een projectsite staat onder /<reponaam>. Laat je ze weg, dan zoekt
 * de pagina zijn bestanden in de root en krijg je een site zonder opmaak.
 * Verhuist de site ooit naar een eigen domein, dan moeten ze juist wég.
 */
const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/facturen',
  assetPrefix: '/facturen/',
};

export default nextConfig;
