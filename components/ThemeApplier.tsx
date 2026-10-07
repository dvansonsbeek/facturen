"use client";

import { useEffect, useSyncExternalStore } from "react";
import { subscribeTheme, readTheme, readServerTheme } from "@/lib/theme";

/**
 * Zet het gekozen thema op <html>, op elke pagina.
 *
 * Dit stond in InvoiceForm, en dat formulier staat alleen op de hoofdpagina.
 * Gevolg: wie in het donker werkte en op de gebruiksvoorwaarden klikte, kreeg
 * een wit scherm in zijn gezicht — die pagina kreeg nooit een data-theme en
 * viel dus terug op het lichte thema.
 *
 * Het knopje om te wisselen blijft in het formulier staan; dat is bediening.
 * Dit is alleen het toepassen van de keuze, en dat hoort bij de omhulling.
 *
 * Schrijft naar de DOM en niet naar state, dus het raakt
 * react-hooks/set-state-in-effect niet.
 */
export default function ThemeApplier() {
    const theme = useSyncExternalStore(subscribeTheme, readTheme, readServerTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return null;
}
