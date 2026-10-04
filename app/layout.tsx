import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facturen - Factuur- en offertegenerator volgens Nederlandse regels",
  description: "Eenvoudig en snel professionele facturen en offertes maken voor de Nederlandse markt.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body>
        {children}
      </body>
    </html>
  );
}
