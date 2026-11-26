/**
 * Page help (owner, 2026-11-26): a short guide on every signed-in page, written for the person's role, and a downloadable
 * PDF guide for the role that starts from signing in. Content: lib/help/content-*.ts (from the role user guides,
 * C:/rof-docs/documentation/user-guides, checked against production 2026-11-25, plus the marking redesign of 2026-11-26).
 */

/** The audiences of the guide. Coach = MENTOR; Super Administrator reads the Administrator guide plus its own topics. */
export type HelpRole = "STUDENT" | "TEACHER" | "COACH" | "HEAD_COACH" | "ADMIN" | "SUPER_ADMIN";

export interface HelpTopic {
  /** Stable id: remembers that the panel opened once for this topic. */
  id: string;
  /**
   * The pages this topic explains, matched by whole path segments from the start: "/mentor/marking" also covers
   * "/mentor/marking/7MX2-97NP", and "*" stands for any one segment (an id). The pattern with the most segments wins,
   * so "/mentor/marking/q" is chosen over "/mentor/marking" on a question page.
   */
  paths: readonly string[];
  /** The page's name as the person sees it in the menu or the page title. */
  title: string;
  /** What the page is for, in one or two sentences. */
  summary: string;
  /** What to do, in order. */
  steps?: readonly string[];
  /** Good to know: limits, what happens next, what to do if something goes wrong. */
  tips?: readonly string[];
}

export interface RoleGuide {
  role: HelpRole;
  /** "Students", "Coaches"… — shown as "Marking · for Coaches". */
  audience: string;
  /** The PDF's first chapter: from opening the website to the first page after signing in. */
  gettingStarted: readonly HelpTopic[];
  /** Every page of the portal, in menu order (the PDF's order). */
  topics: readonly HelpTopic[];
}
