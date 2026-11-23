/**
 * How ROF LMS presents itself to browsers, search engines and link previews (owner, 2026-11-20: the ROF logo in the
 * browser tab; the platform easy to find). The public pages are indexed; the portals (signed-in pages) never are.
 */
import { SITE } from "./content";

const trim = (u: string) => u.replace(/\/+$/, "");

/** The public address of the platform (its own domain); NEXT_PUBLIC_SITE_URL overrides it. Links and the sitemap use it. */
export const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL || "https://lms.rwandaolympiadfoundation.org");

/** The production site's address (its own domain). */
export const PRODUCTION_URLS: readonly string[] = [...new Set([SITE_URL, "https://lms.rwandaolympiadfoundation.org"])];

/** The browser tab and search result title of the home page. */
export const SITE_TITLE = `${SITE.name} · ${SITE.organisation}`;

/** Search result and link preview description. */
export const SITE_DESCRIPTION =
  "ROF LMS, the learning platform of the Rwanda Olympiad Foundation: Olympiad courses, practice problems, assignments, tests and results for students, coaches, teachers and schools in Rwanda.";

export const SITE_KEYWORDS = [
  "ROF LMS", "Rwanda Olympiad Foundation", "ROF", "Olympiad", "Rwanda", "mathematics olympiad", "physics olympiad",
  "computing olympiad", "Olympiad training", "learning platform", "students", "coaches", "schools",
];

/** The public pages search engines may list. */
export const PUBLIC_PAGES = ["/", "/login", "/register", "/register/teacher", "/apply", "/support"] as const;

/** Signed-in areas, never indexed. */
export const PRIVATE_PREFIXES = ["/admin", "/student", "/mentor", "/teacher", "/assignments", "/courses", "/discussions", "/results", "/api"] as const;

/**
 * Indexed only on the production site: a preview or any other copy is never listed. The site is hosted on Vercel, which
 * sets VERCEL_ENV to "production", "preview" or "development" for every build; outside Vercel (local runs) it is unset.
 */
export function indexingAllowed(vercelEnv: string | undefined = process.env.VERCEL_ENV): boolean {
  return vercelEnv === undefined || vercelEnv === "" || vercelEnv === "production";
}
