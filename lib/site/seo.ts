/**
 * How ROF LMS presents itself to browsers, search engines and link previews (owner, 2026-11-20: the ROF logo in the
 * browser tab; the platform easy to find). The public pages are indexed; the portals (signed-in pages) never are.
 */
import { SITE } from "./content";

const trim = (u: string) => u.replace(/\/+$/, "");

/** The public address of the platform (its own domain); NEXT_PUBLIC_SITE_URL overrides it. Links and the sitemap use it. */
export const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL || "https://lms.rwandaolympiadfoundation.org");

/** Every address of the production site (its own domain and Netlify's address of the same site). */
export const PRODUCTION_URLS: readonly string[] = [...new Set([SITE_URL, "https://lms.rwandaolympiadfoundation.org", "https://roflms.netlify.app"])];

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
 * Indexed only on the production site: a copy elsewhere (staging, a preview) is never listed. Netlify sets URL to the
 * site's main address when building (its own domain or its Netlify address); locally it is unset.
 */
export function indexingAllowed(deployUrl: string | undefined = process.env.URL): boolean {
  return !deployUrl || PRODUCTION_URLS.includes(trim(deployUrl));
}
