import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/i18n/server";
import { dirOf } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { getSettings } from "@/server/settings";

const plex = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "StockFlow", template: "%s · StockFlow" },
  description: "Multi-branch inventory management",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#156258" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const settings = await getSettings().catch(() => null);
  return (
    <html lang={locale} dir={dirOf(locale)} className={plex.variable}>
      <body>
        <I18nProvider locale={locale} showHijri={settings?.showHijri ?? false}>{children}</I18nProvider>
      </body>
    </html>
  );
}
