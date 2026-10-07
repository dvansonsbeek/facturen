import type { MetadataRoute } from "next";
import { SITE_URL, siteUrlVoor } from "@/lib/site";

/** Vereist bij output: 'export'; anders behandelt Next deze route als dynamisch. */
export const dynamic = "force-static";

/**
 * De sitemap. Twee adressen, dus de winst is bescheiden — maar hij zorgt er wel
 * voor dat de voorwaardenpagina gevónden wordt in plaats van alleen gevonden te
 * kunnen worden: er wijst maar één verwijzing naartoe, onderaan de hoofdpagina.
 *
 * lastModified komt uit de bouwdatum en niet uit new Date() bij het opvragen:
 * dit bestand wordt bij het bouwen vastgelegd, dus een datum van "nu" zou de
 * datum van de build zijn en zich voordoen als het moment van opvragen.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const bijgewerkt = process.env.NEXT_PUBLIC_BOUWDATUM ?? undefined;

    return [
        {
            url: SITE_URL,
            lastModified: bijgewerkt,
            changeFrequency: 'weekly',
            priority: 1,
        },
        {
            url: siteUrlVoor('voorwaarden'),
            lastModified: bijgewerkt,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ];
}
