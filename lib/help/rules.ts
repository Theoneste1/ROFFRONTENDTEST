/**
 * Page help rules (owner, 2026-11-26): which guide a role reads, which topic explains the current page, how to reach
 * ROF support and the credit line. Pure functions (unit-tested in tests/page-help.test.mjs).
 *
 * Branding (owner, 2026-11-28): no personal name or personal number anywhere in help — the official ROF support
 * details (platform settings: e-mail, phone, hours; GET /support, the same as the Support page and the site footer) and
 * neutral ROF branding.
 */
import type { HelpRole, HelpTopic, RoleGuide } from "./types";
import { COACH_GUIDE, HEAD_COACH_GUIDE } from "./content-coaches";
import { STUDENT_GUIDE, TEACHER_GUIDE } from "./content-learners";
import { ADMIN_GUIDE, SUPER_ADMIN_GUIDE } from "./content-admins";

export type { HelpRole, HelpTopic, RoleGuide };

/** The page with ROF's official support details (platform settings), shared by every role. */
export const SUPPORT_PAGE = "/support";

/** The neutral line shown at the bottom of every help panel and on every page of the PDF guide. */
export const HELP_CREDIT = "ROF LMS · Rwanda Olympiad Foundation";

const GUIDES: Record<HelpRole, RoleGuide> = {
  STUDENT: STUDENT_GUIDE,
  TEACHER: TEACHER_GUIDE,
  COACH: COACH_GUIDE,
  HEAD_COACH: HEAD_COACH_GUIDE,
  ADMIN: ADMIN_GUIDE,
  SUPER_ADMIN: SUPER_ADMIN_GUIDE,
};

/** Every guide, in the order an administrator sees them listed. */
export const ALL_HELP_ROLES: readonly HelpRole[] = ["STUDENT", "TEACHER", "COACH", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"];

/** The guide audience for an account role (MENTOR = Coach). Unknown roles get none: no help button is shown. */
export function helpRoleOf(role: string | null | undefined): HelpRole | null {
  switch (role) {
    case "STUDENT": return "STUDENT";
    case "TEACHER": return "TEACHER";
    case "MENTOR": return "COACH";
    case "HEAD_COACH": return "HEAD_COACH";
    case "ADMIN": return "ADMIN";
    case "SUPER_ADMIN": return "SUPER_ADMIN";
    default: return null;
  }
}

export function guideFor(role: HelpRole): RoleGuide {
  return GUIDES[role];
}

const segments = (path: string) => path.split(/[?#]/)[0].split("/").filter(Boolean);

/**
 * How well a pattern matches a path: -1 when it does not; otherwise more segments win, and among equal lengths the one
 * with more literal (non-"*") segments ("/admin/users/bulk" beats "/admin/users/*").
 */
export function matchScore(pattern: string, path: string): number {
  const p = segments(pattern);
  const s = segments(path);
  if (p.length === 0 || p.length > s.length) return -1;
  let literal = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "*") continue;
    if (p[i] !== s[i]) return -1;
    literal++;
  }
  return p.length * 10 + literal;
}

/** The topic that explains this page for this role, or null when none does (the panel then shows the general help). */
export function topicFor(role: HelpRole, pathname: string): HelpTopic | null {
  let best: HelpTopic | null = null;
  let bestScore = -1;
  for (const topic of guideFor(role).topics) {
    for (const pattern of topic.paths) {
      const score = matchScore(pattern, pathname);
      if (score > bestScore) { best = topic; bestScore = score; }
    }
  }
  return best;
}

/** Shown on a page no topic explains yet. */
export function generalTopic(role: HelpRole): HelpTopic {
  const guide = guideFor(role);
  return {
    id: "general",
    paths: [],
    title: "Help",
    summary: `This page is part of the ${guide.audience.toLowerCase()}' portal. Use the menu on the left to move between pages.`,
    steps: ["Open the user guide below: it explains every page, starting from signing in.", "Still stuck? Contact ROF support: their details are on the Help and Support page."],
  };
}

// ── The user guide inside the system (owner, 2026-11-28: read it on screen, no download needed) ─────────────────────

/** The portal a guide audience reads its guide in (Coaches and Head Coaches share /mentor; Super Administrators /admin). */
const GUIDE_PORTAL: Record<HelpRole, string> = {
  STUDENT: "/student", TEACHER: "/teacher", COACH: "/mentor", HEAD_COACH: "/mentor", ADMIN: "/admin", SUPER_ADMIN: "/admin",
};

/** The in-system user guide of a role: "/mentor/guide"; with a topic, its section ("/mentor/guide#coach-marking"). */
export function guidePagePath(role: HelpRole, topicId?: string): string {
  return `${GUIDE_PORTAL[role]}/guide${topicId ? `#${encodeURIComponent(topicId)}` : ""}`;
}

/**
 * Which guide the guide page shows: the reader's own, or — for Administrators and Super Administrators, who see every
 * role's guide — the one asked for with ?for=COACH. Anything else is the reader's own guide.
 */
export function guideShown(reader: HelpRole, requested: string | null | undefined): HelpRole {
  if (reader !== "ADMIN" && reader !== "SUPER_ADMIN") return reader;
  return (ALL_HELP_ROLES as readonly string[]).includes(requested ?? "") ? (requested as HelpRole) : reader;
}

/** A topic's whole text, for searching the guide. */
function topicText(t: HelpTopic): string {
  return [t.title, t.summary, ...(t.steps ?? []), ...(t.tips ?? [])].join(" ").toLowerCase();
}

/** The topics that contain every word of the search (any order, any case); all of them for an empty search. */
export function searchTopics(topics: readonly HelpTopic[], query: string): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length === 0 ? [...topics] : topics.filter((t) => { const text = topicText(t); return words.every((w) => text.includes(w)); });
}

/**
 * The official support phone (platform settings) in the international digits WhatsApp needs: "0788 123 456",
 * "+250 788 123 456" and "250788123456" all give "250788123456"; another country's "+44 20…" keeps its code. Null when
 * no phone is set or it is not a phone number.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^0[27]\d{8}$/.test(digits)) return `250${digits.slice(1)}`;
  if (/^250[27]\d{8}$/.test(digits)) return digits;
  if (raw.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

/**
 * A WhatsApp chat with ROF's official support phone, with a first message naming the page so support knows where the
 * person is; null when the platform has no support phone (the caller then offers the Support page).
 */
export function whatsappUrl(supportPhone: string | null | undefined, pageTitle?: string | null): string | null {
  const number = whatsappNumber(supportPhone);
  if (!number) return null;
  const text = `Hello ROF support, I need help with ROF LMS${pageTitle ? ` (page: ${pageTitle})` : ""}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The PDF's file name, e.g. "ROF-LMS-guide-Coaches.pdf". */
export function guideFileName(role: HelpRole): string {
  return `ROF-LMS-guide-${guideFor(role).audience.replace(/\s+/g, "-")}.pdf`;
}

/** Where the role's PDF guide is served: "/help/guide/head-coaches.pdf" (app/help/guide/[file]/route.tsx). */
export function guideUrl(role: HelpRole): string {
  return `/help/guide/${guideFor(role).audience.toLowerCase().replace(/\s+/g, "-")}.pdf`;
}

/** The combined guide (every role's chapter), offered to Administrators and Super Administrators. */
export const EVERY_ROLE_GUIDE = { url: "/help/guide/every-role.pdf", fileName: "ROF-LMS-guide-Every-role.pdf" } as const;

/** The role a guide URL's file names ("coaches.pdf"), or null for anything else. */
export function roleFromGuideFile(file: string): HelpRole | null {
  for (const role of Object.keys(GUIDES) as HelpRole[]) if (guideUrl(role) === `/help/guide/${file}`) return role;
  return null;
}
