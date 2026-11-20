/**
 * How ROF LMS presents itself to browsers, search engines and link previews (owner, 2026-11-20: the ROF logo in the
 * browser tab; the platform easy to find). The public pages are indexed; the portals (signed-in pages) never are.
 */
import { SITE } from "./content";

/** The public address of the platform. Set NEXT_PUBLIC_SITE_URL when the platform moves to its own domain. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://roflms.netlify.app").replace(/\/+$/, "");

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
 * Indexed only at the production address: a copy elsewhere (staging, a preview) is never listed. Netlify sets URL to the
 * site's main address when building; locally it is unset.
 */
export function indexingAllowed(deployUrl: string | undefined = process.env.URL): boolean {
  return !deployUrl || deployUrl.replace(/\/+$/, "") === SITE_URL;
}
