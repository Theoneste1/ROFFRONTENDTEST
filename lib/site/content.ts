/**
 * Public homepage content in one place.
 *
 * Rules (owner, 2026-11-06): no invented statistics, partner logos, contact
 * details or URLs. Anything not confirmed is left empty here and the page then
 * hides it or says it is not yet available. Contact e-mail, phone, hours and
 * help link come from the backend (`GET /support`, set in platform settings).
 */

export const SITE = {
  name: "ROF LMS",
  organisation: "Rwanda Olympiad Foundation",
  tagline: "Where curious minds become Olympiad problem-solvers.",
  description:
    "The learning platform of the Rwanda Olympiad Foundation: courses, practice problems, assignments and a community of students, coaches and schools preparing for mathematics Olympiads.",
  /** Official website and social profiles. Add only confirmed official URLs; empty entries are not shown. */
  website: "",
  social: {
    facebook: "https://www.facebook.com/profile.php?id=100077870672247",
    linkedin: "https://www.linkedin.com/company/rwanda-olympiad-foundation/",
    instagram: "https://www.instagram.com/rwanda_olympiad_foundation/",
    whatsapp: "https://whatsapp.com/channel/0029VbAYbFv6rsQwMcGl7g1s",
    youtube: "",
    x: "",
  },
} as const;

export const HERO_QUOTES: string[] = [
  "Every great discovery begins with a question.",
  "Don't be afraid of difficult problems. They are opportunities to become better.",
  "Think deeply. Explore boldly. Achieve greatly.",
  "Your curiosity today can change the world tomorrow.",
  "Mathematics, physics, computing: every field begins with a mind that refuses to give up.",
];

/**
 * Optional hero video (e.g. "/home/hero.mp4", H.264, muted, ≤ 10 MB, plus a
 * poster image). null: the photo slideshow alone is shown (current design).
 */
export const HERO_VIDEO: { src: string; poster: string; label: string } | null = null;

/** Authentic ROF / Rwanda Mathematical Olympiad photographs (public/home). */
export const HERO_SLIDES: { src: string; alt: string }[] = [
  { src: "/home/teacher-explaining.jpg", alt: "A coach explaining a problem to a group of students at their desks" },
  { src: "/home/students-solving.jpg", alt: "Students concentrating as they work through mathematics problems on paper" },
  { src: "/home/exam-hall.jpg", alt: "A large hall of students writing an Olympiad competition paper" },
  { src: "/home/pamo-stage.jpg", alt: "Olympiad teams from many African countries on stage with their national flags" },
  { src: "/home/pamo-team.jpg", alt: "Rwanda's Olympiad team standing together with their medals" },
];

export type Audience = {
  id: "students" | "teachers" | "coaches" | "schools";
  title: string;
  image: { src: string; alt: string };
  points: string[];
  cta: { label: string; href: string };
};

/** Benefits describe features that exist in the LMS today. */
export const AUDIENCES: Audience[] = [
  {
    id: "students",
    title: "For Students",
    image: { src: "/home/students-solving.jpg", alt: "Students solving problems together" },
    points: [
      "Courses in Olympiad mathematics: Algebra, Geometry, Number Theory and Combinatorics",
      "Books, past papers and notes for every course",
      "Assignments reviewed by experienced coaches, with written feedback",
      "Track your results, points and leaderboard ranking",
      "Ask questions and learn together in course discussions",
    ],
    cta: { label: "Join as a Student", href: "/register" },
  },
  {
    id: "teachers",
    title: "For Teachers",
    image: { src: "/home/teachers-workshop.jpg", alt: "Teachers working together at a training workshop" },
    points: [
      "Connect the students in your school to Olympiad learning on ROF LMS",
      "Encourage your students to register and practise with our courses and past papers",
      "Work alongside ROF coaches who mentor and train your students",
      "Hear about Olympiad programmes, competitions and training for teachers",
      "Teacher accounts are not available yet: contact us and we will get in touch",
    ],
    cta: { label: "Join as a Teacher", href: "/?subject=teacher#contact" },
  },
  {
    id: "coaches",
    title: "For Coaches",
    image: { src: "/home/teacher-explaining.jpg", alt: "A coach guiding students through a problem" },
    points: [
      "Coach ROF students in the courses and division you are assigned to",
      "Prepare assignments and review students' work with detailed feedback",
      "Share books, past papers, notes and problem-solving strategies",
      "Follow your students' progress through course analytics",
      "Guide discussions and be part of Rwanda's Olympiad training community",
    ],
    cta: { label: "Join as a Coach", href: "/apply" },
  },
  {
    id: "schools",
    title: "For Schools",
    image: { src: "/home/exam-hall.jpg", alt: "Students from many schools taking part in an Olympiad round" },
    points: [
      "Connect your students and teachers to Olympiad learning opportunities",
      "Encourage a culture of problem-solving and academic excellence",
      "Support your school's participation in Olympiad programmes",
      "Join the wider Rwanda Olympiad Foundation community",
    ],
    cta: { label: "Contact us", href: "#contact" },
  },
];

/** Partners. `logo` only for official logo files; otherwise the name is shown as text (never a substitute image). */
export const PARTNERS: { name: string; fullName: string; url?: string; logo?: { src: string; width: number; height: number; onDark: boolean } }[] = [
  { name: "AOA", fullName: "African Olympiad Academy", logo: { src: "/home/partner-aoa.png", width: 1496, height: 268, onDark: true } },
  { name: "AIMS", fullName: "African Institute for Mathematical Sciences", url: "https://aims.ac.rw", logo: { src: "/home/partner-aims.png", width: 2048, height: 377, onDark: false } },
  { name: "Athemath", fullName: "Athemath", url: "https://athemath.org" },
];
