import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_TITLE, SITE_URL, indexingAllowed } from "@/lib/site/seo";
import { connection } from "next/server";
import { Geist_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// Academic Prestige typography: Newsreader for titles and key figures, Plus Jakarta Sans for text, labels and data.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // The browser tab: "<page> · ROF LMS" with the ROF logo (app/favicon.ico, app/icon.png, app/apple-icon.png).
  title: {
    default: SITE_TITLE,
    template: "%s · ROF LMS",
  },
  description: SITE_DESCRIPTION,
  applicationName: "ROF LMS",
  keywords: SITE_KEYWORDS,
  // Link previews (WhatsApp, Facebook, LinkedIn, X): the name, the description and the ROF logo.
  openGraph: {
    type: "website",
    siteName: "ROF LMS",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_RW",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "ROF logo" }],
  },
  twitter: { card: "summary", title: SITE_TITLE, description: SITE_DESCRIPTION, images: ["/icon-512.png"] },
  robots: indexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
};

/** The phone browser's bar in the institution's deep navy (Academic Prestige primary). */
export const viewport: Viewport = { themeColor: "#061B40" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render per request: the CSP nonce from proxy.ts exists only at request
  // time, and pages pre-rendered at build time would carry no nonce.
  await connection();
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${jakarta.variable} ${geistMono.variable} h-full antialiased`}
      // Browsers and extensions add attributes to <html> (e.g. Edge's
      // data-js-focus-visible). This only silences attribute mismatches on
      // this one element, not on its children.
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
