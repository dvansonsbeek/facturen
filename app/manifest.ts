import type { MetadataRoute } from "next";

/**
 * Zodat de app op een telefoon als snelkoppeling op het beginscherm kan.
 *
 * De paden hierin worden niet door Next herschreven, dus het basispad moet er
 * zelf in. Het komt uit dezelfde omgevingsvariabele als next.config.ts, anders
 * wijst een geïnstalleerde snelkoppeling naar de verkeerde map.
 */
const basePath = process.env.PAGES_BASE_PATH ?? '';

/** Vereist bij output: 'export'; anders behandelt Next deze route als dynamisch. */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Facturen & Offertes",
        short_name: "Facturen",
        description:
            "Gratis facturen en offertes maken volgens Nederlandse btw-regels. "
            + "Alles blijft in je eigen browser.",
        start_url: `${basePath}/`,
        display: "standalone",
        lang: "nl",
        background_color: "#f8fafc",
        theme_color: "#2563eb",
        icons: [
            { src: `${basePath}/icon.svg`, sizes: "any", type: "image/svg+xml" },
            { src: `${basePath}/apple-icon.png`, sizes: "180x180", type: "image/png" },
        ],
    };
}
