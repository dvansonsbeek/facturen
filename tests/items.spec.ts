import { test, expect } from '@playwright/test';
import { ui, previewText, previewHeaders } from './helpers';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

/**
 * De eerste regel bevatte voorbeeldtekst als wáárde ("Dienstverlening"), terwijl
 * een toegevoegde regel die tekst alleen als placeholder toont. Zo kon die tekst
 * ongemerkt op een echte factuur belanden.
 */
test.describe('regels toevoegen en weghalen', () => {
    /**
     * Deze knoppen hadden geen enkele test, terwijl er een grens in zit: de
     * laatste regel mag niet weg. Een document zonder regels is geen document,
     * en je zou geen nieuwe meer kunnen beginnen.
     */
    test('Item Toevoegen zet er een regel bij', async ({ page }) => {
        const app = ui(page);
        await expect(app.itemDescription()).toHaveCount(1);

        await app.addItem.click();
        await expect(page.locator('.item-row')).toHaveCount(2);

        await app.itemDescription(0).fill('Advies');
        await app.itemPrice(0).fill('100');
        await app.itemDescription(1).fill('Reiskosten');
        await app.itemPrice(1).fill('50');

        const tekst = await previewText(page);
        expect(tekst).toContain('Advies');
        expect(tekst).toContain('Reiskosten');
        expect(tekst).toContain('€ 181,50');
    });

    test('een regel weghalen haalt hem ook van het document', async ({ page }) => {
        const app = ui(page);
        await app.itemDescription(0).fill('Advies');
        await app.itemPrice(0).fill('100');
        await app.addItem.click();
        await app.itemDescription(1).fill('Reiskosten');
        await app.itemPrice(1).fill('50');
        await expect(app.preview).toContainText('Reiskosten');

        await app.removeItem(1).click();

        await expect(page.locator('.item-row')).toHaveCount(1);
        const tekst = await previewText(page);
        expect(tekst).not.toContain('Reiskosten');
        expect(tekst).toContain('€ 121,00');
    });

    test('de laatste regel kan niet weg', async ({ page }) => {
        const app = ui(page);
        await app.itemDescription(0).fill('Advies');
        await app.removeItem(0).click();

        // Blijft staan, met wat erin stond: er valt niets te factureren zonder
        // regels, en je kunt er geen nieuwe meer bij krijgen.
        await expect(page.locator('.item-row')).toHaveCount(1);
        await expect(app.itemDescription(0)).toHaveValue('Advies');
    });

    test('de juiste regel verdwijnt, niet de eerste', async ({ page }) => {
        const app = ui(page);
        for (const [i, naam] of ['Eerste', 'Tweede', 'Derde'].entries()) {
            if (i > 0) await app.addItem.click();
            await app.itemDescription(i).fill(naam);
        }

        await app.removeItem(1).click();

        await expect(app.itemDescription(0)).toHaveValue('Eerste');
        await expect(app.itemDescription(1)).toHaveValue('Derde');
    });
});

test('de eerste regel is net zo leeg als een toegevoegde regel', async ({ page }) => {
    const app = ui(page);
    await expect(app.itemName(0)).toHaveValue('');
    await expect(app.itemDescription(0)).toHaveValue('');

    await app.addItem.click();
    await expect(app.itemName(1)).toHaveValue('');
    await expect(app.itemDescription(1)).toHaveValue('');
});

test.describe('eenheid per regel', () => {
    test('de prijskolom heet Prijs, niet Stukprijs', async ({ page }) => {
        // "Stukprijs" klopt niet voor uren.
        expect(await previewHeaders(page)).toEqual(
            ['Beschrijving', 'Aantal', 'Prijs', 'BTW', 'Totaal'],
        );
    });

    test('staat achter het aantal op het document', async ({ page }) => {
        const app = ui(page);
        await app.itemName(0).fill('Advies');
        await app.itemQuantity(0).fill('3');
        await app.itemUnit(0).fill('uur');
        await app.itemPrice(0).fill('85');

        const text = await previewText(page);
        expect(text).toContain('3 uur');
        expect(text).toContain('€ 255,00');
    });

    test('blijft weg als je hem leeg laat, voor een vast bedrag', async ({ page }) => {
        const app = ui(page);
        await app.itemName(0).fill('Projectbegeleiding');
        await app.itemPrice(0).fill('1500');

        const text = await previewText(page);
        expect(text).toContain('€ 1.500,00');
        expect(text).not.toMatch(/1\s+(uur|stuk)/);
    });

    test('accepteert ook een eenheid die niet in de lijst staat', async ({ page }) => {
        const app = ui(page);
        await app.itemQuantity(0).fill('120');
        await app.itemUnit(0).fill('km');
        await expect(ui(page).preview).toContainText('120 km');
    });

    test('verandert niets aan de berekening', async ({ page }) => {
        const app = ui(page);
        await app.itemQuantity(0).fill('3');
        await app.itemUnit(0).fill('uur');
        await app.itemPrice(0).fill('85');

        // Eén keer uitlezen en er drie dingen over beweren leest de oude stand
        // als het voorbeeld nog niet opnieuw getekend is — dit viel om in een
        // volle run en niet in zijn eentje. toContainText probeert het opnieuw.
        const voorbeeld = ui(page).preview;
        await expect(voorbeeld).toContainText('€ 255,00');   // subtotaal
        await expect(voorbeeld).toContainText('€ 53,55');    // 21% btw
        await expect(voorbeeld).toContainText('€ 308,55');   // totaal
    });

    test('biedt suggesties aan zonder ze te verplichten', async ({ page }) => {
        const opties = await page.locator('datalist#eenheden option').evaluateAll(
            (nodes) => nodes.map((n) => (n as HTMLOptionElement).value),
        );
        expect(opties).toContain('uur');
        expect(opties).toContain('stuk');
        expect(opties).toContain('km');
    });
});

/**
 * De opmaak van een regel, en niet wat erin staat.
 *
 * Hier ging het mis zonder dat één test het zag: de eenheid kwam erbij in
 * .mobile-split, dat op display: contents staat, dus zijn drie velden zijn zélf
 * rasteritems. Er waren daarmee zes items en vijf kolommen. Alles schoof een
 * plek op — de btw-keuzelijst belandde in de kolom van 40px die voor het knopje
 * was, en het prullenbakje viel naar een tweede regel onder de beschrijving.
 *
 * Tekstasserties zien zoiets niet. Deze toetsen daarom posities, in de geest van
 * tests/pdf-layout.spec.ts.
 */
test.describe('de opmaak van een regel', () => {
    test.use({ viewport: { width: 1400, height: 900 } });

    /**
     * De controle die er het meest toe doet, want hij pint het verband dat brak:
     * de bovenste regel heeft precies zoveel velden als er kolommen zijn. Zet
     * iemand er een veld bij zonder een kolom, dan gaat deze rood in plaats van
     * dat er stilletjes iets afvalt.
     *
     * De beschrijving telt niet mee: die pakt met grid-column: 1 / -1 bewust de
     * volle breedte op een eigen regel eronder. Daarom wordt er geteld op
     * positie en niet op aantal kinderen — dat laatste zou bij elke bewuste
     * tweede regel omvallen.
     */
    test('de bovenste regel heeft net zoveel velden als kolommen', async ({ page }) => {
        const meting = await page.locator('.item-row').first().evaluate((el) => {
            const stijl = getComputedStyle(el);
            if (stijl.display !== 'grid') return null;

            // display: contents maakt van de kínderen rasteritems, niet van het
            // element zelf — precies wat hier over het hoofd werd gezien.
            const items: Element[] = [];
            const verzamel = (node: Element) => {
                for (const kind of node.children) {
                    if (getComputedStyle(kind).display === 'contents') verzamel(kind);
                    else items.push(kind);
                }
            };
            verzamel(el);

            // Op breedte en niet op hoogte: het prullenbakje staat met
            // align-self: end onderaan zijn cel, dus zijn bovenkant ligt lager
            // dan die van de velden ernaast. Op bovenkant tellen gaf daardoor
            // vijf in plaats van zes — een fout in de meting, niet in de
            // opmaak. Wat de tweede regel kenmerkt is dat hij de volle breedte
            // pakt.
            const breedte = Math.round(el.getBoundingClientRect().width);
            const opDeEersteRegel = items.filter(
                (i) => Math.round(i.getBoundingClientRect().width) < breedte - 1,
            );

            return {
                kolommen: stijl.gridTemplateColumns.split(/\s+/).length,
                opDeEersteRegel: opDeEersteRegel.length,
                // En wat eronder staat hoort de volle breedte te pakken.
                volleBreedte: items
                    .filter((i) => !opDeEersteRegel.includes(i))
                    .every((i) => Math.round(i.getBoundingClientRect().width)
                        >= Math.round(el.getBoundingClientRect().width) - 1),
            };
        });

        expect(meting, 'de regel staat niet als raster; is de containervraag gewijzigd?').not.toBeNull();
        expect(meting!.opDeEersteRegel).toBe(meting!.kolommen);
        expect(meting!.volleBreedte, 'wat onder de eerste regel staat vult hem niet').toBe(true);
    });

    test('zet het prullenbakje op dezelfde regel als de velden', async ({ page }) => {
        const rij = page.locator('.item-row').first();
        const velden = await rij.locator('> div').first().boundingBox();
        const knop = await rij.getByRole('button', { name: /verwijderen/i }).boundingBox();

        // Binnen de verticale grenzen van de regel, en niet eronder.
        expect(knop!.y).toBeGreaterThanOrEqual(velden!.y);
        expect(knop!.y).toBeLessThan(velden!.y + velden!.height);
    });

    /**
     * Geen veld zo smal dat je niet meer ziet wat je invult. De btw-keuzelijst
     * was teruggebracht tot 40px — breed genoeg voor een pijltje en verder niets.
     */
    test('houdt elk veld breed genoeg om te lezen', async ({ page }) => {
        const breedtes = await page.locator('.item-row').first()
            .locator('input, select')
            .evaluateAll((velden) => velden.map((v) => ({
                plek: v.getAttribute('placeholder') ?? v.tagName.toLowerCase(),
                breedte: Math.round(v.getBoundingClientRect().width),
            })));

        expect(breedtes.length).toBeGreaterThan(3);
        for (const veld of breedtes) {
            expect(veld.breedte, `${veld.plek} is maar ${veld.breedte}px breed`)
                .toBeGreaterThan(50);
        }
    });

    /**
     * En op een smalle kolom valt hij terug op onder elkaar. Dat is geen gebrek
     * maar de bedoeling: vanaf 1024px staat het formulier naast het voorbeeld in
     * een kolom van ongeveer 356px, en vijf velden naast elkaar passen daar niet.
     * Daarom kijkt de opmaak naar de ruimte in het formulier en niet naar het
     * venster.
     */
    test('en stapelt ze als het formulier te smal is', async ({ page }) => {
        await page.setViewportSize({ width: 1024, height: 900 });
        const display = await page.locator('.item-row').first()
            .evaluate((el) => getComputedStyle(el).display);
        expect(display).toBe('flex');
    });
});

/**
 * De tekst die een leeg veld toont, moet er ook in passen — op elke breedte.
 *
 * Twee dingen misten hier eerder. Ik toetste met scrollWidth > clientWidth, en
 * dat ziet alleen een ingevulde wáárde die overloopt; een afgekapte placeholder
 * merkt het niet op. Dus staat "uur, stuk…" als "uur, st" op het scherm terwijl
 * de test groen blijft, en valt het pas op een schermafdruk op. Daarom meet deze
 * test de tekst echt op in hetzelfde lettertype.
 *
 * En hij deed het op één breedte, en keek alleen naar invoervelden. Allebei te
 * weinig. De kolommen zijn fr-delen, dus de verhouding die bij 1400px klopte
 * liep bij 1280px mis — daar is het formulier juist smáller, omdat het voorbeeld
 * ernaast staat. Vandaar deze lijst breedtes, met 1280 en 700 erbij als de
 * krapste gevallen die ik opmat.
 *
 * En de btw-keuzelijst bleef buiten schot terwijl daar "21% BT" stond: geen
 * placeholder maar een gekozen wáárde, wat erger is. Die telt hier dus mee, met
 * 20px gereserveerd voor het pijltje dat de browser bínnen de content box
 * tekent.
 */
test.describe('de tekst in een veld past erin', () => {
    const meetTeKrappeVelden = (rij: Element) => {
        /* Het pijltje van een <select> wordt door de browser getekend en staat
           niet in de padding; opgemeten in Chromium op zo'n 16px, met wat lucht
           erbij 20. Een vaste waarde is hier beter dan hem proberen uit te
           rekenen: te ruim schatten maakt de test streng, en streng is precies
           wat je wil voor een afgekapt bedrag. */
        const PIJLTJE = 20;
        const uit: string[] = [];

        const breedteVan = (tekst: string, font: string) => {
            const meet = document.createElement('span');
            meet.style.cssText =
                `position:absolute;visibility:hidden;white-space:nowrap;font:${font}`;
            meet.textContent = tekst;
            document.body.appendChild(meet);
            const breedte = meet.getBoundingClientRect().width;
            meet.remove();
            return breedte;
        };

        const toets = (veld: Element, tekst: string, extra: number) => {
            const stijl = getComputedStyle(veld);
            const nodig = breedteVan(tekst, stijl.font) + extra;
            const ruimte = (veld as HTMLElement).clientWidth
                - parseFloat(stijl.paddingLeft) - parseFloat(stijl.paddingRight);
            if (nodig > ruimte) {
                uit.push(`"${tekst}" vraagt ${Math.round(nodig)}px `
                    + `en krijgt ${Math.round(ruimte)}px`);
            }
        };

        for (const veld of rij.querySelectorAll('input[placeholder], textarea[placeholder]')) {
            toets(veld, (veld as HTMLInputElement).placeholder, 0);
        }
        // De langste optie, niet de gekozen: ook 9% BTW moet je straks kunnen
        // lezen zonder dat de opmaak meeschuift.
        for (const lijst of rij.querySelectorAll('select')) {
            for (const optie of (lijst as HTMLSelectElement).options) {
                toets(lijst, optie.text, PIJLTJE);
            }
        }
        return uit;
    };

    for (const breedte of [390, 700, 768, 900, 1280, 1400, 1920]) {
        test(`bij een venster van ${breedte}px`, async ({ page }) => {
            await page.setViewportSize({ width: breedte, height: 900 });
            const teKrap = await page.locator('.item-row').first()
                .evaluate(meetTeKrappeVelden);
            expect(teKrap, teKrap.join('; ')).toEqual([]);
        });
    }
});
