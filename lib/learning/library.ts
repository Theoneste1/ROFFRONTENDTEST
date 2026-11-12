/**
 * The student's Mathematics resource library: pure filtering and grouping.
 *
 * Backend facts it relies on (same on the LEGACY and NEW backends):
 * - `GET /courses` (student): the PUBLISHED courses; each carries its discipline.
 *   The Mathematics topics are the four Mathematics courses: ALGEBRA, GEOMETRY,
 *   NUMBER_THEORY, COMBINATORICS. Only courses whose discipline is MATHEMATICS
 *   are part of this library.
 * - `GET /courses/:id/resources` (student): only PUBLISHED, non-archived resources
 *   of the student's own division (Junior S1–S3 or Senior S4–S6). Another
 *   division's resources are never returned (404), so the library shows the
 *   student's division and never offers to switch.
 * Filtering here only narrows what the backend already allowed.
 */
import type { Course, CourseResource, ResourceType } from "../api/types";

export const MATHEMATICS = "MATHEMATICS";

/** The topic order used everywhere in the library. */
export const TOPIC_ORDER = ["ALGEBRA", "GEOMETRY", "NUMBER_THEORY", "COMBINATORICS"] as const;
export const TOPIC_LABEL: Readonly<Record<string, string>> = {
  ALGEBRA: "Algebra",
  GEOMETRY: "Geometry",
  NUMBER_THEORY: "Number Theory",
  COMBINATORICS: "Combinatorics",
};

/** Resource kinds shown to students (backend ResourceType grouped as on the course pages). */
export type ResourceKind = "books" | "notes" | "papers";
export const KIND_TYPES: Readonly<Record<ResourceKind, readonly ResourceType[]>> = {
  books: ["BOOK", "EBOOK"],
  notes: ["NOTE", "ATTACHMENT"],
  papers: ["PAST_PAPER"],
};
export const KIND_LABEL: Readonly<Record<ResourceKind, string>> = { books: "Books", notes: "Notes", papers: "Past papers" };
export const TYPE_LABEL: Readonly<Record<ResourceType, string>> = {
  BOOK: "Book",
  EBOOK: "E-book",
  NOTE: "Notes",
  ATTACHMENT: "Material",
  PAST_PAPER: "Past paper",
};

export function kindOf(type: ResourceType): ResourceKind {
  return (Object.keys(KIND_TYPES) as ResourceKind[]).find((k) => KIND_TYPES[k].includes(type)) ?? "notes";
}

/** The library's courses: Mathematics only, in topic order (unknown codes last, by sortOrder). */
export function mathematicsCourses(courses: readonly Course[]): Course[] {
  const rank = (c: Course) => {
    const i = (TOPIC_ORDER as readonly string[]).indexOf(c.code);
    return i === -1 ? TOPIC_ORDER.length : i;
  };
  return courses
    .filter((c) => c.discipline?.code === MATHEMATICS)
    .sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder);
}

export const topicLabel = (course: Pick<Course, "code" | "title">) => TOPIC_LABEL[course.code] ?? course.title;

export interface LibraryFilters {
  /** A course id, or "" for every topic. */
  topic: string;
  kind: ResourceKind | "";
  /** Free text: title, description, author, source and tags (case-insensitive). */
  q: string;
  /** Exam / publication year, or null for any. */
  year: number | null;
}

export const NO_FILTERS: LibraryFilters = { topic: "", kind: "", q: "", year: null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function matchesSearch(r: CourseResource, q: string): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm([r.title, r.description, r.author, r.source, ...r.tags].filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

export function filterResources(resources: readonly CourseResource[], f: LibraryFilters): CourseResource[] {
  return resources.filter(
    (r) =>
      (!f.topic || r.courseId === f.topic) &&
      (!f.kind || KIND_TYPES[f.kind].includes(r.type)) &&
      (f.year === null || r.year === f.year) &&
      matchesSearch(r, f.q),
  );
}

/** Distinct years, newest first (for the year filter). */
export function yearsOf(resources: readonly CourseResource[]): number[] {
  return [...new Set(resources.map((r) => r.year).filter((y): y is number => typeof y === "number"))].sort((a, b) => b - a);
}

export function countByKind(resources: readonly CourseResource[]): Record<ResourceKind, number> {
  const out: Record<ResourceKind, number> = { books: 0, notes: 0, papers: 0 };
  for (const r of resources) out[kindOf(r.type)]++;
  return out;
}

/**
 * Parse the URL state; unknown values fall back to "no filter". `topicIds` null:
 * the topics aren't loaded yet — keep the topic as given and check it later.
 */
export function parseLibraryParams(p: { get(name: string): string | null }, topicIds: readonly string[] | null): LibraryFilters {
  const kind = p.get("kind");
  const year = Number(p.get("year"));
  const topic = p.get("topic") ?? "";
  return {
    topic: topicIds === null || topicIds.includes(topic) ? topic : "",
    kind: kind === "books" || kind === "notes" || kind === "papers" ? kind : "",
    q: (p.get("q") ?? "").slice(0, 100),
    year: Number.isInteger(year) && year >= 1800 ? year : null,
  };
}
