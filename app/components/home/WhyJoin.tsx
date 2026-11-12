import Image from "@/app/components/ui/Image";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AUDIENCES } from "@/lib/site/content";
import Reveal from "./Reveal";

const ACCENT: Record<string, string> = {
  students: "from-sky-500 to-blue-700",
  teachers: "from-emerald-500 to-teal-700",
  coaches: "from-amber-400 to-orange-600",
  schools: "from-fuchsia-500 to-purple-700",
};

/** "Why join": one card per audience, describing features the LMS actually has. */
export default function WhyJoin() {
  return (
    <section id="why-join" className="bg-gradient-to-b from-slate-50 to-blue-50/60 py-20 sm:py-28" aria-labelledby="why-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#00428c]">Why join</p>
          <h2 id="why-title" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Why join the ROF LMS community?</h2>
          <p className="mt-4 text-lg text-slate-600">One platform for everyone who believes young people can solve hard problems.</p>
        </Reveal>

        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.id} delayClass={i % 2 ? "delay-150" : ""} as="article" className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
              <div className="relative h-52 overflow-hidden sm:h-60">
                <Image src={a.image.src} alt={a.image.alt} width={1920} height={1080} sizes="(min-width: 768px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className={`absolute inset-0 bg-gradient-to-t ${ACCENT[a.id]} opacity-60 mix-blend-multiply`} aria-hidden="true" />
                <h3 className="absolute bottom-4 left-6 text-2xl font-extrabold text-white drop-shadow">{a.title}</h3>
              </div>
              <div className="flex flex-1 flex-col p-6 sm:p-8">
                <ul className="space-y-3">
                  {a.points.map((p) => (
                    <li key={p} className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#00428c]" aria-hidden="true" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  {a.cta.href.startsWith("#") ? (
                    <a href={a.cta.href} className="inline-flex items-center gap-2 rounded-full bg-[#001E4E] px-6 py-3 font-semibold text-white transition hover:bg-[#00428c]">
                      {a.cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : (
                    <Link href={a.cta.href} className="inline-flex items-center gap-2 rounded-full bg-[#001E4E] px-6 py-3 font-semibold text-white transition hover:bg-[#00428c]">
                      {a.cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
