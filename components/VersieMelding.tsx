"use client";

import { useSyncExternalStore } from "react";
import {
    BOUWVERSIE, alsDatum, subscribeVersie, readVersie, readServerVersie,
} from "@/lib/versie";

/**
 * Zegt het eenmalig wanneer de app sinds je vorige bezoek is bijgewerkt.
 *
 * Online haalt de service worker altijd de nieuwste versie; dat is met opzet,
 * want zo bereikt een herstelde fout iedereen. Het nadeel is dat de app dan
 * onder je handen verandert zonder dat je het merkt, en dat past niet bij een
 * app die zegt dat je deze versie hébt. Deze regel maakt die verandering
 * zichtbaar in plaats van stil.
 *
 * Geen venster en geen knop die je moet wegklikken: hij staat er één keer en is
 * de volgende keer weg, omdat de nieuwe versie bij het lezen al is vastgelegd.
 */
export default function VersieMelding() {
    const vorige = useSyncExternalStore(subscribeVersie, readVersie, readServerVersie);
    if (!vorige) return null;

    return (
        <p
            role="status"
            style={{
                maxWidth: 'min(100%, 90ch)',
                margin: '1rem auto 0',
                fontSize: '0.8rem',
                color: 'var(--muted)',
            }}
        >
            Deze app is bijgewerkt naar de versie van <strong>{alsDatum(BOUWVERSIE)}</strong>;
            hiervoor gebruikte je die van {alsDatum(vorige)}.
        </p>
    );
}
