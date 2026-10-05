import { defineConfig, devices } from '@playwright/test';

/**
 * De UAT-reis tegen de gepubliceerde build, niet tegen de ontwikkelserver.
 *
 * Twee redenen dat dit een eigen configuratie is. De gewone suite draait tegen
 * `next dev`, en dat is een ander pad: een statische export bundelt anders en
 * loopt onder een strenger beveiligingsbeleid (lib/csp.ts), dus een fout daarin
 * is daar niet te zien. En deze reis moet níet parallel: het is één
 * doorlopende staat.
 *
 * Standaard serveert hij out/ zelf, onder hetzelfde voorvoegsel als GitHub
 * Pages. Met UAT_BASE_URL draait hij tegen een echte site — bijvoorbeeld de net
 * gepubliceerde versie — en start hij geen eigen server. Dat kan zonder
 * bijwerking: er is geen server en geen account, dus alles wat de reis aanmaakt
 * staat in de browser van de test en verdwijnt ermee.
 */
const BASE_PATH = process.env.PAGES_BASE_PATH ?? '';
const POORT = 4174;
const EIGEN_URL = `http://localhost:${POORT}${BASE_PATH}/`;
const extern = process.env.UAT_BASE_URL;

export default defineConfig({
    testDir: './tests/uat',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    // Geen herkansing: een reis die alleen bij de tweede poging lukt, is kapot.
    // Juist de volgorde is wat hier getoetst wordt.
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: extern ?? EIGEN_URL,
        trace: 'retain-on-failure',
        ...devices['Desktop Chrome'],
    },
    ...(extern ? {} : {
        webServer: {
            command: 'node scripts/statische-server.mjs',
            url: EIGEN_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
            // Expliciet meegeven en niet op de omgeving vertrouwen: zonder het
            // juiste voorvoegsel serveert hij de root en geeft elke asset een 404.
            env: { POORT: String(POORT), PAGES_BASE_PATH: BASE_PATH },
        },
    }),
});
