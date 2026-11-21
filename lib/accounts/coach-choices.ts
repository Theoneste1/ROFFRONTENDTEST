/**
 * Coach application choices (owner, 2026-11-21): occupation as a dropdown, areas of expertise and relevant experience as
 * tick lists, each with "Other". The server keeps these as text (occupation 2–200, expertise 2–1000, experience
 * 2–2000 characters), so the choices are sent as readable text ("Algebra; Geometry; Other: Game theory") and nothing
 * changes on the server or in the review screens. Pure; unit-tested in tests/coach-choices.test.mjs.
 */

/** Occupation dropdown; "Other (type it)" shows a text box. */
export const OCCUPATIONS: readonly string[] = [
  "Secondary school teacher",
  "University lecturer or researcher",
  "University student",
  "Olympiad coach or trainer",
  "Engineer",
  "Software developer",
  "Scientist or researcher",
  "Self-employed",
];

/** Areas of expertise, grouped by Olympiad subject. */
export const EXPERTISE_GROUPS: ReadonlyArray<{ subject: string; areas: readonly string[] }> = [
  { subject: "Mathematics", areas: ["Algebra", "Combinatorics", "Geometry", "Number theory", "Inequalities"] },
  { subject: "Computing", areas: ["Algorithms", "Data structures", "Programming", "Competitive programming"] },
  { subject: "Physics", areas: ["Mechanics", "Electricity and magnetism", "Thermodynamics", "Optics and waves", "Modern physics", "Experimental physics"] },
];
export const EXPERTISE_AREAS: readonly string[] = EXPERTISE_GROUPS.flatMap((g) => g.areas);

/** Relevant experience. */
export const EXPERIENCE_OPTIONS: readonly string[] = [
  "Took part in a national Olympiad",
  "Took part in an international Olympiad (e.g. IMO, IOI, IPhO)",
  "Coached or trained Olympiad students",
  "Taught at a secondary school",
  "Taught at a university",
  "Set problems or organised competitions",
  "Mentored or tutored students",
];

const SEP = "; ";
const OTHER = "Other: ";

/** The text sent: the chosen options in list order, then "Other: …" when given. */
export function joinChoices(options: readonly string[], chosen: readonly string[], other: string | null): string {
  const picked = options.filter((o) => chosen.includes(o));
  const o = other?.trim();
  return [...picked, ...(o ? [`${OTHER}${o}`] : [])].join(SEP);
}

/** Back from text (a draft or a stored answer): the known options, and everything else as "Other". */
export function splitChoices(options: readonly string[], text: string): { chosen: string[]; other: string | null } {
  const parts = text.split(/;\s*/).map((p) => p.trim()).filter(Boolean);
  const chosen = options.filter((o) => parts.includes(o));
  const rest = parts.filter((p) => !options.includes(p)).map((p) => (p.startsWith(OTHER) ? p.slice(OTHER.length) : p));
  return { chosen, other: rest.length ? rest.join(SEP) : null };
}

/** Toggle one option. */
export function toggleChoice(chosen: readonly string[], option: string): string[] {
  return chosen.includes(option) ? chosen.filter((c) => c !== option) : [...chosen, option];
}

/** A single choice with "Other": the dropdown value for a stored text ("" empty, a listed one, else the Other marker). */
export const OTHER_CHOICE = "__other__";
export function singleChoice(options: readonly string[], value: string, otherChosen = false): string {
  const t = value.trim();
  if (otherChosen) return OTHER_CHOICE;
  if (!t) return "";
  return options.includes(t) ? t : OTHER_CHOICE;
}
