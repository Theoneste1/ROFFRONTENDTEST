import Image from "@/app/components/ui/Image";
import Link from "next/link";
import { GraduationCap, Presentation, Trophy } from "lucide-react";
import Reveal from "./Reveal";

const OPTIONS = [
  { href: "/register", label: "Join as a Student", text: "Create your account and start learning", icon: GraduationCap },
  { href: "/register/teacher", label: "Join as a Teacher", text: "Connect your school's students with ROF", icon: Presentation },
  { href: "/apply", label: "Join as a Coach", text: "Apply to mentor and train our students", icon: Trophy },
];

/**
 * Final call to action. Students register (POST /auth/register/student); teachers
 * register (/register/teacher, which offers the contact form while registration is
 * closed); coaches apply (POST /mentor-requests).
 */
export default function JoinCta() {
  return (
    <section id="join" className="relative isolate overflow-hidden bg-brand-950 py-24 sm:py-32" aria-labelledby="join-title">
      <Image src="/home/pamo-flags.jpg" alt="" width={1920} height={1080} sizes="100vw" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-950 via-brand-950/90 to-brand/80" aria-hidden="true" />
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 id="join-title" className="text-[2rem] leading-[2.5rem] text-white sm:text-[2.75rem] sm:leading-[3.25rem]">
            Be Part of Something <span className="text-amber-400">Extraordinary.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-blue-100 sm:text-xl">
            Whether you are a student passionate about learning, a teacher inspiring young minds, or a coach developing future problem-solvers, there is a place for you in the Rwanda Olympiad Foundation community.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {OPTIONS.map(({ href, label, text, icon: Icon }, i) => (
            <Reveal key={href} delayClass={["", "delay-100", "delay-200"][i]}>
              <Link href={href} className="group flex h-full flex-col items-center rounded-2xl bg-white/10 p-7 text-center ring-1 ring-white/20 backdrop-blur transition hover:-translate-y-1 hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-400 text-brand-950 transition group-hover:bg-brand-950 group-hover:text-amber-300">
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="mt-4 text-lg font-extrabold text-white group-hover:text-brand-950">{label}</span>
                <span className="mt-1 text-sm text-blue-100 group-hover:text-brand-950/80">{text}</span>
              </Link>
            </Reveal>
          ))}
        </div>
        <p className="mt-10 text-sm text-blue-100/80">
          Already a member?{" "}
          <Link href="/login" className="font-semibold text-amber-300 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}
