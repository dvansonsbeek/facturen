"use client";

import { useEffect } from "react";
import { telpixelUrl, wilGeteldWorden } from "@/lib/analytics";

/**
 * Telt één bezoek, met een afbeelding en niet met andermans script.
 *
 * Zie lib/analytics.ts voor waarom het zo moet. Rendert zelf niets: het is een
 * verzoek, geen element op het scherm — een <img> in de boom zou in de weg
 * kunnen staan in de opmaak en bij schermlezers.
 */
export default function VisitCounter() {
    useEffect(() => {
        if (!wilGeteldWorden(navigator)) return;

        const url = telpixelUrl(window.location, document.referrer, {
            width: window.screen.width,
            height: window.screen.height,
            pixelRatio: window.devicePixelRatio,
        });
        if (!url) return;

        // new Image() en niet fetch(): een afbeelding valt onder img-src, zodat
        // connect-src dicht kan blijven. Mislukken mag geruisloos — een
        // bezoekersteller is nooit een reden om de app te laten struikelen.
        const pixel = new Image();
        pixel.referrerPolicy = 'no-referrer';
        pixel.src = url;
    }, []);

    return null;
}
