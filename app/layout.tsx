import type { Metadata } from "next";
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
  title: {
    default: "ROF LMS",
    template: "%s · ROF LMS",
  },
  description: "Rwanda Olympiad Foundation — Mathematics learning platform",
};

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
