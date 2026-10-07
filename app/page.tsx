import InvoiceForm from "@/components/InvoiceForm";
import { ReceiptEuro } from "lucide-react";

/**
 * Een gewone <a> en geen next/link, met het basispad er zelf voor.
 *
 * next/link navigeert binnen de pagina en haalt de volgende route met fetch op.
 * Het strikte beveiligingsbeleid staat onder `connect-src` geen enkele herkomst
 * toe (zie lib/csp.ts) — dat is daar geen slordigheid maar het hele punt — dus
 * die fetch wordt geweigerd en de verwijzing doet niets in de gepubliceerde
 * versie. Een volledige paginawissel heeft die fetch niet nodig.
 *
 * Het basispad moet er dan wel met de hand voor: dat regelt next/link anders.
 * Gevonden door check:publicatie, niet door de testsuite — op de
 * ontwikkelserver staat het beleid losser en werkt next/link gewoon.
 */
const BASISPAD = process.env.PAGES_BASE_PATH ?? '';

export default function Home() {
  return (
    <main className="min-h-screen">
      <header style={{ padding: '2rem 1rem 1rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '10px' }}>
            <ReceiptEuro color="white" size={24} />
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', margin: 0 }}>Facturen &amp; Offertes</h1>
        </div>
        {/* Breedtelimiet in ch, niet in px: die schaalt mee met de lettergrootte
            hierboven en houdt een regel leesbaar kort. Ruim genoeg voor deze zin,
            zodat hij op één regel past zodra het scherm dat toelaat; op smalle
            schermen breekt hij vanzelf af. */}
        <p style={{ color: 'var(--secondary)', fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', maxWidth: 'min(100%, 90ch)', margin: '0 auto' }}>
          Razendsnel facturen en offertes, met Nederlandse btw-tarieven en KOR-ondersteuning.
        </p>
      </header>

      <InvoiceForm />

      <footer style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
        {/* Geen auteursrechtregel: toeschrijving staat in LICENSE en README,
            waar de MIT-licentie die ook vraagt. Dit is productinterface. */}
        <p>Geen opslag op servers, alles in jouw browser.</p>
        {/* De twee ontkenningen staan vóór de verwijzing, en niet erin. Deze app
            noemt wetsartikelen bij naam en toetst de e-factuur tegen de officiële
            validator; juist dat kan de indruk wekken dat wat eruit komt
            gegarandeerd klopt. Wie de voorwaarden nooit opent, hoort dat hier al
            gelezen te hebben. */}
        <p style={{ marginTop: '0.5rem' }}>
          Geen boekhoudpakket en geen belastingadvies. Door deze app te gebruiken ga je akkoord
          met de <a href={`${BASISPAD}/voorwaarden`}>gebruiksvoorwaarden</a>.
        </p>
      </footer>
    </main>
  );
}
