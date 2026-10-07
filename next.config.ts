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
  env: {
    /**
     * Hetzelfde basispad, maar dan leesbaar in de browser.
     *
     * De service worker wordt geregistreerd op zijn eigen pad, en dat moet
     * kloppen: een service worker mag alleen gaan over de map waarin hij staat,
     * dus vanaf de root zou hij onder /facturen/ weigeren. basePath zelf is
     * alleen bekend tijdens het bouwen, en een clientcomponent kan er niet bij
     * zonder NEXT_PUBLIC_.
     */
    NEXT_PUBLIC_BASE_PATH: basePath,
    /**
     * Welke versie je hebt, als datum.
     *
     * Nodig sinds de app offline werkt. Een tekstverwerker van 1995 veroudert
     * niet, een factuurprogramma wel: btw-tarieven schuiven, de KOR-grens
     * schuift, EN 16931 draagt een jaartal en vanaf 1 juli 2030 is
     * e-factureren verplicht. Wie een versie "heeft" hoort te kunnen zien
     * welke.
     */
    NEXT_PUBLIC_BOUWDATUM: new Date().toISOString().slice(0, 10),
  },
};

export default nextConfig;
