/**
 * Registration history on the administrators' user page (REG-13): GET /admin/users/:id/registration-timeline
 * (users.manage) returns the account's current stages and its registration-related events, oldest first. The backend
 * sends only safe details (from / to, reason, question, statuses) — never contact data — so the page shows what it
 * receives. Backends without the route answer 404: the card then says the history is not available.
 * Pure; tested in tests/registration-timeline.test.mjs.
 */

export interface RegistrationTimelineEvent {
  id: string;
  at: string;
  action: string;
  label: string;
  /** "SELF" (the person), "APPLICANT" (nobody signed in: a public application) or the administrator's role. */
  actor: string;
  actorUsername: string | null;
  details: Record<string, unknown> | null;
}

export interface RegistrationTimeline {
  userId: string;
  stages: {
    created: string;
    activated: string | null;
    approved: boolean;
    accountStatus: string;
    schoolVerification: string | null;
    source: "TEACHER_APPLICATION" | "COACH_APPLICATION" | null;
  };
  events: RegistrationTimelineEvent[];
}

const SOURCE: Record<string, string> = {
  TEACHER_APPLICATION: "Teacher application",
  COACH_APPLICATION: "Coach application",
};

const words = (v: string) =>
  v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");

/** The stage rows shown above the events: [label, value]. Dates are left to the caller's formatter. */
export function stageRows(
  t: RegistrationTimeline,
  formatDate: (iso: string) => string,
): Array<[string, string]> {
  const s = t.stages;
  return [
    ["Created", formatDate(s.created)],
    ["Activated", s.activated ? formatDate(s.activated) : "Not yet"],
    ["Approved", s.approved ? "Yes" : "No"],
    ["Account state", words(s.accountStatus)],
    [
      "School verification",
      s.schoolVerification ? words(s.schoolVerification) : "No school claim",
    ],
    [
      "Came from",
      s.source
        ? (SOURCE[s.source] ?? s.source)
        : "Direct registration or invitation",
    ],
  ];
}

/** Who did it: "The person", "The applicant", or "Administrator (admin)". */
export function actorText(
  e: Pick<RegistrationTimelineEvent, "actor" | "actorUsername">,
  roleLabel: (r: string) => string = words,
): string {
  if (e.actor === "SELF") return "The person";
  if (e.actor === "APPLICANT") return "The applicant";
  const role = roleLabel(e.actor);
  return e.actorUsername ? `${role} (${e.actorUsername})` : role;
}

/** One line of the safe details, or null: "Active → Suspended · Reason: …", "Question: …". */
export function detailText(
  details: RegistrationTimelineEvent["details"],
): string | null {
  if (!details) return null;
  const str = (k: string) =>
    typeof details[k] === "string" ? (details[k] as string) : null;
  const parts: string[] = [];
  const from = str("from") ?? str("fromStatus");
  const to = str("to") ?? str("toStatus") ?? str("status");
  if (from && to) parts.push(`${words(from)} → ${words(to)}`);
  else if (to) parts.push(words(to));
  if (str("question")) parts.push(`Question: ${str("question")}`);
  if (str("reason")) parts.push(`Reason: ${str("reason")}`);
  if (str("supersedeReason"))
    parts.push(`Replaced: ${words(str("supersedeReason")!)}`);
  return parts.length ? parts.join(" · ") : null;
}
