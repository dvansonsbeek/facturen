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
