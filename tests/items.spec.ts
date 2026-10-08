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
 * De tekst die een veld toont, moet er ook in passen — in elk veld van het
 * formulier, op elke breedte.
 *
 * Drie dingen misten hier. Ik toetste eerst met scrollWidth > clientWidth, en dat
 * ziet alleen een ingevulde wáárde die overloopt; een afgekapte placeholder merkt
 * het niet op. Dus stond "uur, stuk…" als "uur, st" op het scherm terwijl de test
 * groen bleef, en viel het pas op een schermafdruk op.
 *
 * Toen deed hij het op één breedte. Ook te weinig: de kolommen van een itemregel
 * zijn fr-delen, dus de verhouding die bij 1400px klopte liep bij 1280px mis —
 * daar is het formulier juist smáller, omdat het voorbeeld ernaast staat.
 *
 * En hij keek alleen naar de itemregel, terwijl de ergste gevallen daarbuiten
 * stonden: "Nodig om de e-factuur via Peppol te kunnen versturen" vroeg 419px in
 * een veld van 281px. Daarom nu het hele formulier.
 *
 * Elk soort veld kapt anders af, en dat is de kern van deze test:
 *
 * - **input** kapt af op één regel. Opgemeten tekstbreedte tegen de ruimte binnen
 *   de padding.
 * - **textarea** kapt *niet* horizontaal af maar loopt door naar de volgende
 *   regel, en kan alleen onderaan wegvallen. Hem als één regel meten meldde
 *   afkappingen die er niet zijn — gecontroleerd door er een veel te lange hint in
 *   te zetten en ernaar te kijken. Dus hier de gewikkelde hoogte tegen de hoogte
 *   van het veld.
 * - **select** toont geen placeholder maar een gekozen wáárde, wat erger is als
 *   hij wegvalt. Daar stond "21% BT". De browser tekent het pijltje bínnen de
 *   content box, dus daar gaat ruimte van af.
 */
test.describe('de tekst in een veld past erin', () => {
    const meetTeKrappeVelden = () => {
        /* Het pijltje van een <select> wordt door de browser getekend en staat
           niet in de padding; opgemeten in Chromium op zo'n 16px, met wat lucht
           erbij 20. Een vaste waarde is hier beter dan hem proberen uit te
           rekenen: te ruim schatten maakt de test streng, en streng is precies
           wat je wil voor een afgekapt bedrag. */
        const PIJLTJE = 20;
        const uit: string[] = [];

        /** De ruimte binnen de padding, horizontaal en verticaal. */
        const binnenruimte = (veld: HTMLElement) => {
            const s = getComputedStyle(veld);
            return {
                breed: veld.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
                hoog: veld.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom),
                font: s.font,
                lineHeight: s.lineHeight,
            };
        };

        const meetIn = (stijl: string, tekst: string) => {
            const meet = document.createElement('div');
            meet.style.cssText = `position:absolute;visibility:hidden;${stijl}`;
            meet.textContent = tekst;
            document.body.appendChild(meet);
            const vak = meet.getBoundingClientRect();
            meet.remove();
            return vak;
        };

        for (const veld of document.querySelectorAll<HTMLElement>(
            'input[placeholder], textarea[placeholder], select',
        )) {
            // Onzichtbaar (dichtgeklapt, of verborgen achter Bewerken) valt af:
            // daar is niets te meten en een 0 zou alles rood maken.
            if (!veld.clientWidth || !veld.clientHeight) continue;
            const ruimte = binnenruimte(veld);

            if (veld instanceof HTMLTextAreaElement) {
                const hoogte = meetIn(
                    `width:${ruimte.breed}px;font:${ruimte.font};line-height:${ruimte.lineHeight};`
                    + 'white-space:pre-wrap;overflow-wrap:break-word',
                    veld.placeholder,
                ).height;
                if (hoogte > ruimte.hoog) {
                    uit.push(`textarea "${veld.placeholder}" is ${Math.round(hoogte)}px `
                        + `hoog gewikkeld en krijgt ${Math.round(ruimte.hoog)}px`);
                }
                continue;
            }

            /* Elke optie, niet alleen de gekozen: ook 9% BTW moet je straks kunnen
               lezen zonder dat de opmaak meeschuift.

               Van een optie van de vorm "Naam — uitleg" telt alleen "Naam". Een
               uitklaplijst toont de volle tekst zodra je hem opent; de dichtgeklapte
               lijst is een samenvatting, en wat daar moet passen is het deel dat de
               opties uit elkaar houdt. Eisen dat de hele uitleg erin past zou
               betekenen dat de btw-regimes hun uitleg moeten inleveren om een test
               tevreden te stellen, en die uitleg is daar het nuttigst. */
            const teksten = veld instanceof HTMLSelectElement
                ? [...veld.options].map((o) => o.text.split(' — ')[0])
                : [(veld as HTMLInputElement).placeholder];
            const extra = veld instanceof HTMLSelectElement ? PIJLTJE : 0;

            for (const tekst of teksten) {
                const nodig = meetIn(`white-space:nowrap;font:${ruimte.font}`, tekst).width + extra;
                if (nodig > ruimte.breed) {
                    uit.push(`"${tekst}" vraagt ${Math.round(nodig)}px `
                        + `en krijgt ${Math.round(ruimte.breed)}px`);
                }
            }
        }
        return uit;
    };

    for (const breedte of [390, 700, 768, 900, 1280, 1400, 1920]) {
        test(`bij een venster van ${breedte}px`, async ({ page }) => {
            await page.setViewportSize({ width: breedte, height: 900 });
            // Ook wat dichtgeklapt staat: daar zitten de betaalgegevens en de
            // bedrijfsgegevens, en die werden tot nu toe nooit opgemeten.
            await page.evaluate(() => {
                for (const d of document.querySelectorAll('details')) d.open = true;
            });
            const teKrap = await page.evaluate(meetTeKrappeVelden);
            expect(teKrap, teKrap.join('; ')).toEqual([]);
        });
    }
});
