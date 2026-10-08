import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    // tests/uat hoort bij playwright.productie.config.ts: die draait tegen de
    // gepubliceerde build, op één worker, als één doorlopende staat. Hier zou
    // hij parallel naast de rest komen en tegen de ontwikkelserver draaien.
    testIgnore: '**/uat/**',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'list',

    /**
     * Ruimere grenzen dan de standaard, en wel om deze reden.
     *
     * Playwright geeft een test standaard 30 seconden en een losse expect vijf.
     * Die vijf zijn hier te krap gebleken: er stonden al tien asserties verspreid
     * over drie bestanden met een eigen, langere grens — zes op 30 seconden rond
     * het afleiden van een sleutel (600.000 PBKDF2-rondes duren nu eenmaal), en
     * drie op tien seconden voor wat via het storage-event van het ene tabblad
     * naar het andere moet komen. Tien keer met de hand hetzelfde repareren is
     * het teken dat de standaard niet past bij deze suite.
     *
     * En er zat een addertje onder: een expect van 30 seconden kón die nooit
     * halen, want de test eromheen stopte er zelf al na 30. Vandaar dat de test
     * nu 60 krijgt; anders is zo'n plaatselijke verruiming schijn.
     *
     * Dit is geen herkansing en geen verdoezelde wedloop. Het verruimt alleen de
     * tijd waarin iets mág gebeuren, en kost niets zolang alles groen is —
     * wachten doet hij alleen als het misgaat. Een echte fout valt nog steeds om,
     * alleen iets later.
     */
    timeout: 60_000,
    expect: { timeout: 10_000 },
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
