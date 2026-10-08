import { test, expect, type Page } from '@playwright/test';
import { openFoldout } from './helpers';

/**
 * Past de app op het scherm waarop hij geopend wordt?
 *
 * Niet "ziet het er mooi uit" — dat kan een test niet zien — maar vier dingen
 * waar wél een norm voor bestaat, getoetst op de formaten die mensen echt
 * gebruiken:
 *
 * 1. De pagina mag niet horizontaal schuiven. Dat is de klassieke fout van een
 *    indeling die niet meebeweegt, en hij valt meteen op.
 * 2. Niets mag buiten het venster steken. Staat de helft van een veld naast het
 *    scherm, dan is het er voor de gebruiker niet.
 * 3. Aanraakvlakken van minstens 44x44 punten op een aanraakscherm — Apple HIG;
 *    Material houdt 48dp aan, dus 44 is de ondergrens van de twee.
 * 4. Invoervelden van minstens 16px op een aanraakscherm. Onder die grens zoomt
 *    Safari op iOS bij het aantikken de pagina in en zoomt daarna niet terug
 *    uit. globals.css weet dat al — de basisregel zegt 16px met precies die
 *    opmerking erbij — maar dat wordt verderop weer overschreven.
 *
 * De laatste twee gelden alleen waar met een vinger wordt bediend. Een knop van
 * 25px is met een muis prima, en alles op 44px zetten zou het formulier op een
 * desktop onnodig uit elkaar trekken.
 */

interface Scherm {
    naam: string;
    viewport: { width: number; height: number };
    /** Wordt dit scherm met een vinger bediend? */
    aanraak: boolean;
}

const SCHERMEN: Scherm[] = [
    { naam: 'iPhone SE', viewport: { width: 375, height: 667 }, aanraak: true },
    { naam: 'iPhone 15', viewport: { width: 393, height: 852 }, aanraak: true },
    { naam: 'iPhone 15 Pro Max', viewport: { width: 430, height: 932 }, aanraak: true },
    { naam: 'iPad mini staand', viewport: { width: 768, height: 1024 }, aanraak: true },
    { naam: 'iPad Pro staand', viewport: { width: 1024, height: 1366 }, aanraak: true },
    { naam: 'iPad liggend', viewport: { width: 1180, height: 820 }, aanraak: true },
    { naam: 'laptop', viewport: { width: 1366, height: 768 }, aanraak: false },
    { naam: 'desktop', viewport: { width: 1920, height: 1080 }, aanraak: false },
];

/**
 * Alles openklappen, anders blijft het halve formulier buiten beeld en toetst
 * de helft van deze controles niets.
 */
const alleSectiesOpen = async (page: Page) => {
    await page.goto('/');
    for (const kop of ['Mijn Bedrijfsgegevens', 'Mijn Betaalgegevens', 'Beveiliging en privacy']) {
        await openFoldout(page, kop);
    }
};

for (const scherm of SCHERMEN) {
    test.describe(scherm.naam, () => {
        test.use({
            viewport: scherm.viewport,
            isMobile: scherm.aanraak,
            hasTouch: scherm.aanraak,
        });

        test('de pagina schuift niet horizontaal', async ({ page }) => {
            await alleSectiesOpen(page);

            const overloop = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
            expect(overloop, 'de pagina is breder dan het scherm').toBeLessThanOrEqual(1);
        });

        test('niets steekt buiten het venster', async ({ page }) => {
            await alleSectiesOpen(page);

            const buiten = await page.evaluate((breedte) => {
                const uit: string[] = [];
                for (const el of document.querySelectorAll('input, select, textarea, button, h1, h2, h3')) {
                    // Het documentvoorbeeld schuift bewust in zijn eigen vak; dat
                    // is geen overloop van de pagina.
                    if (el.closest('.preview-section')) continue;
                    const r = el.getBoundingClientRect();
                    if (r.width === 0) continue;
                    if (r.right > breedte + 1 || r.left < -1) {
                        uit.push(`${el.tagName.toLowerCase()}#${el.id || '?'} ${Math.round(r.left)}..${Math.round(r.right)}`);
                    }
                }
                return uit;
            }, scherm.viewport.width);

            expect(buiten, `staat buiten beeld: ${buiten.join(', ')}`).toEqual([]);
        });

        if (!scherm.aanraak) return;

        /**
         * Alleen knoppen en keuzelijsten, niet elke verwijzing: een verwijzing
         * middenin een lopende zin op 44px zetten zou de tekst uit elkaar
         * trekken, en daar gaat de richtlijn ook niet over.
         */
        test('je kunt alles met een vinger raken (44px)', async ({ page }) => {
            await alleSectiesOpen(page);

            const teKlein = await page.evaluate(() => {
                const uit: string[] = [];
                for (const el of document.querySelectorAll('button, select, summary')) {
                    if (el.closest('.preview-section')) continue;
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) continue;
                    if (r.height < 44 || r.width < 44) {
                        const naam = (el.textContent || el.getAttribute('title') || el.tagName)
                            .trim().slice(0, 24);
                        uit.push(`${naam} (${Math.round(r.width)}x${Math.round(r.height)})`);
                    }
                }
                return uit;
            });

            expect(teKlein, `te klein om aan te tikken: ${teKlein.join(', ')}`).toEqual([]);
        });

        /**
         * Onder 16px zoomt Safari op iOS bij het aantikken in, en daarna niet
         * meer uit. Je zit dan met de rest van het formulier buiten beeld.
         */
        test('iOS zoomt niet in bij het aantikken van een veld (16px)', async ({ page }) => {
            await alleSectiesOpen(page);

            const teFijn = await page.evaluate(() => {
                const uit: string[] = [];
                for (const el of document.querySelectorAll('input, select, textarea')) {
                    if (el.closest('.preview-section')) continue;
                    const grootte = parseFloat(getComputedStyle(el).fontSize);
                    if (grootte < 16) {
                        uit.push(`${el.id || el.getAttribute('placeholder') || el.tagName}: ${grootte}px`);
                    }
                }
                return uit;
            });

            expect(teFijn, `onder 16px, iOS zoomt in: ${teFijn.join(', ')}`).toEqual([]);
        });
    });
}
