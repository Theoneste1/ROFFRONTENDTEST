import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import HomeNav from "@/app/components/home/HomeNav";
import Hero from "@/app/components/home/Hero";
import Stats from "@/app/components/home/Stats";
import WhyJoin from "@/app/components/home/WhyJoin";
import Partners from "@/app/components/home/Partners";
import Contact from "@/app/components/home/Contact";
import JoinCta from "@/app/components/home/JoinCta";
import HomeFooter from "@/app/components/home/HomeFooter";
import { SITE } from "@/lib/site/content";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "ROF LMS · Rwanda Olympiad Foundation" },
  description: SITE.description,
};

/**
 * Public homepage. Signed-in users are sent on to their portal (HomeNav).
 */
export default function HomePage() {
  return (
    <div className={`home-page ${jakarta.className} bg-[#001E4E] text-slate-900 antialiased`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-amber-400 focus:px-4 focus:py-2 focus:font-bold focus:text-[#001E4E]">
        Skip to content
      </a>
      <HomeNav />
      <main id="main">
        <Hero />
        <Stats />
        <WhyJoin />
        <Partners />
        <Suspense>
          <Contact />
        </Suspense>
        <JoinCta />
      </main>
      <HomeFooter />
    </div>
  );
}
