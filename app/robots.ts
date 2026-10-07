import type { MetadataRoute } from "next";
import { siteUrlVoor } from "@/lib/site";

/** Vereist bij output: 'export'; anders behandelt Next deze route als dynamisch. */
export const dynamic = "force-static";

/**
 * robots.txt.
 *
 * Er was er geen, en zonder bestand mag een zoekmachine alles — dus er was niets
 * geblokkeerd. Hij staat er vooral om de sitemap aan te wijzen: dat is het eerste
 * bestand dat een crawler opvraagt, en het is de nette plek om te zeggen waar de
 * rest staat.
 *
 * Alles is toegestaan. Er valt hier niets af te schermen: twee pagina's, geen
 * accounts, geen zoekresultaten en geen eindeloze parameters. De voorwaarden
 * mogen uitdrukkelijk mee — daar staat het argument over de verwerkersovereenkomst,
 * en dat is juist iets waarop gevonden worden nuttig is.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: '*', allow: '/' },
        sitemap: siteUrlVoor('sitemap.xml'),
    };
}
