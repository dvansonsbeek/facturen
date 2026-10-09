"use client";

import { useEffect } from "react";

/**
 * Zet de service worker aan, zodat de app ook zonder netwerk opent.
 *
 * Zie public/sw.js voor wat hij doet en waarom er geen "nieuwe versie"-knop bij
 * hoort. Rendert zelf niets; net als VisitCounter is dit een handeling en geen
 * element op het scherm.
 *
 * ## Alleen in de gepubliceerde versie
 *
 * Tijdens ontwikkelen zou een service worker tussen de hot reload gaan zitten,
 * en in de testsuite zou hij toestand meeslepen tussen dingen die juist schoon
 * horen te beginnen. Dezelfde keuze als bij de bezoekersteller: uit, tenzij het
 * de echte build is.
 *
 * De offline-test draait daarom in playwright.productie.config.ts, want daar
 * bestaat dit gedrag pas.
 */
export default function ServiceWorker() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (!('serviceWorker' in navigator)) return;

        // Het pad meegeven in plaats van '/sw.js': onder GitHub Pages staat de
        // app onder /facturen/, en een service worker mag alleen gaan over de
        // map waarin hij zelf staat. Vanaf de root zou hij buiten zijn bereik
        // vallen en weigeren te registreren.
        const basis = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
        navigator.serviceWorker.register(`${basis}/sw.js`).catch(() => {
            // Geen reden om de app te laten struikelen: zonder service worker
            // werkt alles precies zoals eerst, alleen niet offline.
        });

        /*
         * De PDF-brok alvast ophalen, want anders klopt de belofte niet.
         *
         * react-pdf wordt pas geladen als je op Download PDF drukt; zie
         * InvoiceForm.tsx, waar dat met opzet zo staat omdat het ruim een
         * megabyte is. De service worker legt bij het installeren alleen de
         * adressen vast die hij in de HTML tegenkomt, en een brok die pas bij
         * een klik geladen wordt, staat daar niet in. Gevolg: offline deed
         * Download PDF niets — tenzij je de knop toevallig online al eens had
         * gebruikt, want dan zat hij via de gewone fetch-afhandeling alsnog in
         * de cache.
         *
         * Dat raakt juist het geval waarvoor dit allemaal bedoeld is. Het
         * beveiligingspaneel zegt "factureren in de trein of bij een klant
         * zonder wifi", en dan is de PDF het enige wat je wilt.
         *
         * Daarom hier, en niet in sw.js: de worker zou de naam van die brok
         * moeten raden, en die draagt een hash. De app weet hem wél — een
         * gewone import() is genoeg, de service worker vangt het verzoek op en
         * bewaart het antwoord.
         *
         * Na het laden en alleen online, zodat het de eerste weergave niet
         * ophoudt. Mislukt het, dan verandert er niets: dan is het precies de
         * situatie van hiervoor, en die geeft nu een melding.
         */
        const warmPdf = async () => {
            if (!navigator.onLine) return;
            try {
                const [{ pdf }, { default: InvoiceDocument }] = await Promise.all([
                    import("@react-pdf/renderer"),
                    import("./InvoiceDocument"),
                ]);
                // Er wordt écht één document gerenderd, en het resultaat wordt
                // weggegooid. Dat is geen omslachtigheid maar de kern: alleen
                // importeren haalt de brok van react-pdf binnen, en die van
                // fontkit en pdf-lib (420 kB) komt pas als er daadwerkelijk
                // letters gezet worden. Precies die ontbrak offline, met een
                // mislukt verzoek en verder niets.
                //
                // Zo blijft dit ook kloppen als het PDF-pad er ooit nog een brok
                // bij krijgt: wat de knop ophaalt, haalt dit ook op. Een lijstje
                // bestandsnamen zou opnieuw achterlopen zodra iemand iets
                // toevoegt, en dat is precies hoe dit stuk ging.
                const blob = await pdf(
                    <InvoiceDocument
                        data={{
                            id: 'warm',
                            invoiceNumber: 'warm',
                            date: '2026-01-01',
                            sender: {
                                name: '', address: '', zip: '', city: '',
                                country: 'Nederland', email: '', vatNumber: '',
                            },
                            client: {
                                name: '', address: '', zip: '', city: '', country: '',
                            },
                            items: [],
                        }}
                    />,
                ).toBlob();

                // En stempelen, want daar zit de tweede brok. pdf-lib (420 kB,
                // samen met fontkit) komt pas in beeld bij deze stap, en juist
                // díe ontbrak offline: renderen lukte, stempelen niet. Precies
                // het pad van downloadPdf in InvoiceForm.tsx dus, tot en met de
                // laatste stap, anders warm je het halve pad op.
                const { stampPageNumbers } = await import("@/lib/page-numbers");
                await stampPageNumbers(await blob.arrayBuffer());
            } catch {
                // Dan blijft het zoals het was: Download PDF haalt het bij
                // gebruik alsnog op, en lukt dat niet, dan zegt het formulier dat.
            }
        };
        if ('requestIdleCallback' in window) {
            const id = (window as Window & {
                requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
            }).requestIdleCallback(warmPdf, { timeout: 5000 });
            return () => (window as Window & {
                cancelIdleCallback?: (id: number) => void;
            }).cancelIdleCallback?.(id);
        }
        const timer = setTimeout(warmPdf, 2000);
        return () => clearTimeout(timer);
    }, []);

    return null;
}
