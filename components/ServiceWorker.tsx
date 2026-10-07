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
    }, []);

    return null;
}
