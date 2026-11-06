import type { ReactNode } from "react";
import Image from "next/image";
import { PARTNERS } from "@/lib/site/content";
import Reveal from "./Reveal";

/**
 * Partners. Official logo files only; partners without one are shown by name
 * (never a substitute image). Logos for dark backgrounds sit on a navy tile.
 */
/** A partner tile: links to the partner's official website when one is set. */
function Tile({ url, label, className, children }: { url?: string; label: string; className: string; children: ReactNode }) {
  if (!url) return <div className={className}>{children}</div>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label} website (opens in a new tab)`} className={className}>
      {children}
    </a>
  );
}

export default function Partners() {
  return (
    <section id="partners" className="bg-white py-20 sm:py-24" aria-labelledby="partners-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#00428c]">Our partners</p>
          <h2 id="partners-title" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Supported by the Olympiad community</h2>
          <p className="mt-4 text-lg text-slate-600">Organisations that support mathematics Olympiads and education in Rwanda and across Africa.</p>
        </Reveal>

        <ul className="mt-14 grid gap-6 sm:grid-cols-3">
          {PARTNERS.map((p, i) => (
            <Reveal as="li" key={p.name} delayClass={["", "delay-100", "delay-200"][i]}>
              <Tile url={p.url} label={p.fullName} className={`flex h-36 items-center justify-center rounded-2xl px-8 ring-1 transition hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428c] ${p.logo?.onDark ? "bg-[#0b1f4b] ring-[#0b1f4b]" : p.logo ? "bg-white ring-slate-200" : "bg-slate-50 ring-slate-200"}`}>
                {p.logo ? (
                  <Image src={p.logo.src} alt={`${p.fullName} logo`} width={p.logo.width} height={p.logo.height} sizes="320px" className="h-auto max-h-16 w-full max-w-[260px] object-contain" />
                ) : (
                  <span className="text-center">
                    <span className="block text-3xl font-extrabold tracking-tight text-[#001E4E]">{p.name}</span>
                    {p.fullName !== p.name && <span className="mt-1 block text-sm font-medium text-slate-500">{p.fullName}</span>}
                  </span>
                )}
              </Tile>
              {p.logo && <p className="mt-3 text-center text-sm font-medium text-slate-600">{p.fullName}</p>}
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
