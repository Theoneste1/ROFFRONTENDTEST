/**
 * Page help rules (owner, 2026-11-26): which guide a role reads, which topic explains the current page, the technical
 * support contact (WhatsApp) and the credit line. Pure functions (unit-tested in tests/page-help.test.mjs).
 */
import type { HelpRole, HelpTopic, RoleGuide } from "./types";
import { COACH_GUIDE, HEAD_COACH_GUIDE } from "./content-coaches";
import { STUDENT_GUIDE, TEACHER_GUIDE } from "./content-learners";
import { ADMIN_GUIDE, SUPER_ADMIN_GUIDE } from "./content-admins";

export type { HelpRole, HelpTopic, RoleGuide };

/** Technical support (owner, 2026-11-26): Theoneste, Technology lead, on WhatsApp. */
export const TECH_SUPPORT = {
  name: "Theoneste",
  title: "Technology lead",
  /** As people dial it in Rwanda. */
  phoneDisplay: "0780 850 611",
  /** International form for WhatsApp (wa.me takes digits only, country code first). */
  whatsappNumber: "250780850611",
} as const;

/** The credit shown at the bottom of every help panel and on every page of the PDF guide. */
export const HELP_CREDIT = `Made by ${TECH_SUPPORT.name}, ${TECH_SUPPORT.title}`;

const GUIDES: Record<HelpRole, RoleGuide> = {
  STUDENT: STUDENT_GUIDE,
  TEACHER: TEACHER_GUIDE,
  COACH: COACH_GUIDE,
  HEAD_COACH: HEAD_COACH_GUIDE,
  ADMIN: ADMIN_GUIDE,
  SUPER_ADMIN: SUPER_ADMIN_GUIDE,
};

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
    steps: ["Download the full guide below: it explains every page, starting from signing in.", "Still stuck? Contact technical support on WhatsApp."],
  };
}

/** The WhatsApp chat link, with a first message naming the page so support knows where the person is. */
export function whatsappUrl(pageTitle?: string | null): string {
  const text = `Hello ${TECH_SUPPORT.name}, I need help with ROF LMS${pageTitle ? ` (page: ${pageTitle})` : ""}.`;
  return `https://wa.me/${TECH_SUPPORT.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

/** The PDF's file name, e.g. "ROF-LMS-guide-Coaches.pdf". */
export function guideFileName(role: HelpRole): string {
  return `ROF-LMS-guide-${guideFor(role).audience.replace(/\s+/g, "-")}.pdf`;
}

/** Where the role's PDF guide is served: "/help/guide/head-coaches.pdf" (app/help/guide/[file]/route.tsx). */
export function guideUrl(role: HelpRole): string {
  return `/help/guide/${guideFor(role).audience.toLowerCase().replace(/\s+/g, "-")}.pdf`;
}

/** The role a guide URL's file names ("coaches.pdf"), or null for anything else. */
export function roleFromGuideFile(file: string): HelpRole | null {
  for (const role of Object.keys(GUIDES) as HelpRole[]) if (guideUrl(role) === `/help/guide/${file}`) return role;
  return null;
}
