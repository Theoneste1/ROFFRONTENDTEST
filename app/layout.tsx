import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_TITLE, SITE_URL, indexingAllowed } from "@/lib/site/seo";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

/** The phone browser's bar in the logo blue. */
export const viewport: Viewport = { themeColor: "#00428C" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render per request: the CSP nonce from proxy.ts exists only at request
  // time, and pages pre-rendered at build time would carry no nonce.
  await connection();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
