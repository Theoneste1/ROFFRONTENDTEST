"use client";

/**
 * "ROF LMS in numbers", from `GET /public/statistics` (active members only;
 * see the backend's PublicSiteService for the definitions).
 * - Loading: pulsing placeholders. Error: "—" and a note. Never invented numbers.
 * - Teachers: school teachers do not have accounts yet, so the API returns
 *   null and the card says so.
 * - Counters animate once the section scrolls into view.
 */
import { useEffect, useState } from "react";
import { GraduationCap, Presentation, Trophy, School, UsersRound } from "lucide-react";
import { usePublicStatistics } from "@/lib/queries/account";
import Reveal, { useInView } from "./Reveal";

const CARDS = [
  { key: "students", label: "Students", text: "Active learners preparing for Olympiads", icon: GraduationCap, tone: "from-sky-400 to-blue-600" },
  { key: "teachers", label: "Teachers", text: "Teachers from the schools we work with", icon: Presentation, tone: "from-emerald-400 to-teal-600" },
  { key: "coaches", label: "Coaches", text: "Coaches mentoring and training our students", icon: Trophy, tone: "from-amber-300 to-orange-500" },
  { key: "schools", label: "Schools", text: "Schools with students on the platform", icon: School, tone: "from-fuchsia-400 to-purple-600" },
  { key: "members", label: "Community members", text: "All active members of the platform", icon: UsersRound, tone: "from-rose-400 to-pink-600" },
] as const;

function Counter({ value, run }: { value: number; run: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let id = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1600);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [run, value]);
  return <>{shown.toLocaleString()}</>;
}

export default function Stats() {
  const query = usePublicStatistics();
  const stats = query.data;
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section id="impact" className="relative overflow-hidden bg-gradient-to-b from-[#001E4E] to-[#00428c] py-20 sm:py-28" aria-labelledby="impact-title">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">ROF LMS in numbers</p>
          <h2 id="impact-title" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Our growing community</h2>
          <p className="mt-4 text-lg text-blue-100">Students, teachers, coaches and schools across Rwanda, learning and solving problems together.</p>
        </Reveal>

        <div ref={ref} className="mt-14 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-5" aria-busy={query.isPending || undefined}>
          {CARDS.map(({ key, label, text, icon: Icon, tone }, i) => {
            const value = stats?.[key];
            return (
              <Reveal key={key} delayClass={["", "delay-100", "delay-200", "delay-300", "delay-500"][i]} className={`rounded-2xl bg-white/[0.07] p-5 sm:p-6 ring-1 ring-white/15 backdrop-blur transition hover:-translate-y-1 hover:bg-white/[0.11] ${i === CARDS.length - 1 ? "col-span-2 lg:col-span-1" : ""}`}>
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-lg`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="mt-5 text-4xl font-extrabold tabular-nums text-white" data-stat={key}>
                  {query.isPending ? (
                    <span className="inline-block h-9 w-20 animate-pulse rounded-lg bg-white/15 align-middle" aria-label="Loading" />
                  ) : typeof value === "number" ? (
                    <Counter value={value} run={inView} />
                  ) : (
                    <span className="text-white/40" aria-label="Not available">—</span>
                  )}
                </p>
                <h3 className="mt-1 text-base font-bold text-white">{label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-blue-100/80">{text}</p>
                {key === "teachers" && stats && stats.teachers === null && (
                  <p className="mt-2 text-xs text-amber-200/90">Teachers are not yet registered on the platform.</p>
                )}
              </Reveal>
            );
          })}
        </div>

        {query.isError && (
          <p className="mt-8 text-center text-sm text-blue-100/70" role="note" data-testid="stats-unavailable">
            Live community figures are temporarily unavailable. Please check back soon.
          </p>
        )}
        {stats && (
          <p className="mt-8 text-center text-xs text-blue-100/60">Active members, updated every few minutes.</p>
        )}
      </div>
    </section>
  );
}
