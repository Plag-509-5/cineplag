import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/dm-sans/index.css";
import "@fontsource-variable/outfit/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CinéPlag — Films, séries, animes et K-dramas",
  description: "Films, séries, animes, K-dramas et webtoons en VF et VOSTFR. Créez vos listes et suivez votre progression.",
  applicationName: "CinéPlag",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
