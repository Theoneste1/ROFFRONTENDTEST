"use client";

/**
 * Hero: authentic ROF photographs crossfading with a slow zoom, rotating
 * motivational quotes and the three calls to action.
 * - Auto-rotation pauses with the Pause button and never starts for visitors
 *   who prefer reduced motion (WCAG 2.2.2).
 * - Images use explicit sizes + classes (no `fill`): the CSP blocks inline
 *   style attributes in server-rendered HTML.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "@/app/components/ui/Image";
import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Pause, Play, Users } from "lucide-react";
import { HERO_QUOTES, HERO_SLIDES, HERO_VIDEO } from "@/lib/site/content";

const SLIDE_MS = 7000;
const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function Hero() {
  const [index, setIndex] = useState(0);
  // Visitors who prefer reduced motion start paused; an explicit Play/Pause choice wins.
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED).matches, () => false);
  const [choice, setChoice] = useState<"play" | "pause" | null>(null);
  const rotating = choice ? choice === "play" : !reducedMotion;
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [rotating]);

  const slide = index % HERO_SLIDES.length;
  const quote = index % HERO_QUOTES.length;

  return (
    <section id="top" className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-[#001E4E]" aria-label="Welcome">
      {/* Photographs */}
      <div className="absolute inset-0 -z-10" aria-hidden={false}>
        {HERO_SLIDES.map((s, i) => (
          <div key={s.src} className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${i === slide ? "opacity-100" : "opacity-0"}`} aria-hidden={i !== slide}>
            <Image
              src={s.src}
              alt={i === slide ? s.alt : ""}
              width={1920}
              height={1080}
              sizes="100vw"
              priority={i === 0}
              className={`absolute inset-0 h-full w-full object-cover ${i === slide ? "home-zoom" : ""}`}
            />
          </div>
        ))}
        {HERO_VIDEO && rotating && (
          // Optional video over the photos; not shown when paused or for reduced motion.
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={HERO_VIDEO.src}
            poster={HERO_VIDEO.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={HERO_VIDEO.label}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#001E4E]/95 via-[#001E4E]/75 to-[#00428c]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#001E4E] via-transparent to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300 ring-1 ring-white/20 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
            Rwanda Olympiad Foundation
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Where curious minds become <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">Olympiad problem-solvers</span>
          </h1>

          {/* Rotating quote */}
          <figure className="mt-8 border-l-4 border-amber-400 pl-5" aria-live="polite" aria-atomic="true">
            <blockquote key={quote} className="home-quote text-xl font-medium italic leading-relaxed text-blue-50 sm:text-2xl">
              “{HERO_QUOTES[quote]}”
            </blockquote>
          </figure>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/register" className="group inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 font-bold text-[#001E4E] shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5 hover:bg-amber-300">
              <GraduationCap className="h-5 w-5" /> Join as a Student
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/?subject=teacher#contact" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-bold text-[#001E4E] transition hover:-translate-y-0.5 hover:bg-blue-50">
              <Users className="h-5 w-5" /> Join as a Teacher
            </Link>
            <Link href="/login?next=%2Fstudent%2Fcourses" className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-semibold text-white ring-1 ring-white/50 transition hover:bg-white/10">
              <BookOpen className="h-5 w-5" /> Explore Learning Resources
            </Link>
          </div>
        </div>
      </div>

      {/* Slide controls */}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/30 px-4 py-2 backdrop-blur sm:left-auto sm:right-8 sm:translate-x-0">
        {HERO_SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-2.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${i === slide ? "w-7 bg-amber-400" : "w-2.5 bg-white/60 hover:bg-white"}`}
            aria-label={`Show photo ${i + 1} of ${HERO_SLIDES.length}`}
            aria-current={i === slide ? "true" : undefined}
          />
        ))}
        <button
          type="button"
          onClick={() => setChoice(rotating ? "pause" : "play")}
          className="ml-1 rounded-full p-1 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          aria-label={rotating ? "Pause the slideshow and quotes" : "Play the slideshow and quotes"}
        >
          {rotating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
