# ROF LMS — Frontend Audit (ROFFRONTENDTEST)

Audit date: 2026-11-05 · Phase 1 (assessment only, no source changes)

Status legend: **Complete (static)** = UI finished but mock data · **Partial** = UI incomplete and/or many dead controls · **Stub** = placeholder · **Obsolete** = feature removed from backend.

## 1. Stack and architecture

| Item | Finding |
|---|---|
| Framework | Next.js **16.3.0** (App Router), React 19.2.8, TypeScript (strict), Tailwind CSS 4, `lucide-react` |
| Dependencies installed | **No** — `node_modules/` is absent, so the project cannot currently build or run, and the Next 16 docs that `AGENTS.md` requires reading (`node_modules/next/dist/docs/`) are not available yet |
| Git | Branch `main` with **no commits**; every file is untracked |
| API integration | **None.** There are no `fetch`, axios, env variables, API client, auth, or session code anywhere in `app/` |
| State/data | Every page uses hardcoded arrays/object literals; interactivity is local `useState` only |
| Shared code | No shared `lib/`, types, hooks, or UI component library; each role area has its own copies of Navbar/Sidebar |
| `next.config.ts` | Empty |
| Root layout `app/layout.tsx` | Loads Geist fonts; **no `metadata`** (no page titles) |
| `app/globals.css` | Default create-next-app tokens; `body { font-family: Arial }` overrides Geist; dark-mode variables flip the body to dark while pages hardcode light colours |
| Root page `app/page.tsx` | "Choose your portal" with links to Student and Mentor dashboards only (**no admin link, no login**) |
| `README.md` | Unmodified create-next-app boilerplate |

### Route inventory (52 `.tsx` files, ~14,000 lines)

```
/                                   portal chooser
/admin → /admin/dashboard           redirect
/admin/{dashboard,users,mentors,students,divisions,courses,assignments,results,results/[id],reports,audit-log}
/mentor/{dashboard,students,assignments,assignments/[id],live-sessions,courses}
/mentor/assignments/create{,/instructions,/resources}
/mentor/assignments/[id]/assignmentReview{,/[submissionId]}
/mentor/assignments/[id]/submissions{,/[submissionId]}      (duplicate of assignmentReview)
/mentor/courses/{upload-book,studentlist,studentlist/message,studentlist/message/success}
/student/{dashboard,courses,courses/[course],assignments,assignments/[id],assignments/results,leaderboard,live-sessions}
```

**Missing entirely:** login, logout, register, forgot/reset password, account activation, profile/settings, notifications inbox, discussions, and any admin page for settings, academic years, mentor requests, mentor scopes, moderation, or e-mail.

## 2. Layouts, navigation and design language

- **Shells:** `app/admin/components/AdminShell.tsx`, `app/mentor/layout.tsx`, and `app/student/components/StudentShell.tsx` each hold `isSidebarOpen` and render a role-specific Navbar and Sidebar from `app/<role>/dashboard/components/`.
- **Navbars:** the user name and e-mail are hardcoded ("Admin User / admin@rof.com", "Mentor Name / mentor@roflms.com", "Hope Zawadi / hopevzawadii@gmail.com"). The bell icon has no handler.
- **Sidebars:**
  - Every link target exists. The exceptions are the Help, Settings and Sign Out buttons, which have **no handlers in any role**.
  - The dashboard link is labelled "Menu".
  - Each sidebar repeats near-identical link markup instead of mapping an array.
  - `/mentor/students` exists but nothing links to it.
- **Dead code:** `app/components/Sidebar.tsx` is unused. Nothing imports it, and its links point to non-existent top-level routes.
- **Design language (to preserve):**
  - Slate background `#e2e8f0` shell, white rounded cards, indigo/navy primary (`#2B2BB2` family), pill filters, compact tables, `lucide-react` icons, and the ROF logo `public/logo.png`.
- **Design inconsistencies:**
  - Pages set their own `bg-[#E6EBF2]`, which differs from the shell's `#e2e8f0`.
  - Pages render a nested `<main>` inside the shell's `<main>`.
  - There are about 9 different primary-button hex values.
  - Some components use inline SVG, others lucide.
  - Indentation is a mix of 2 and 4 spaces.
  - Table header styles vary.

## 3. Module-by-module assessment

### 3.1 Admin (`app/admin/`)

| Route / file | UI | Data source | Dead / broken controls | Verdict |
|---|---|---|---|---|
| `/admin/dashboard` `dashboard/page.tsx` (server) | Greeting, 5 metric cards, "Needs attention", "Recent activity" | `metrics`, `attentionItems`, `recentActivities` literals | Attention items look clickable but aren't | Complete (static) |
| `/admin/users` `users/page.tsx` + `components/UsersTableClient.tsx` | Search, role/status pills, users table | `INITIAL_USERS` (12 rows, **no students**) | "View" → `alert()`; no create/invite/import/suspend/delete; "Pending" has no tab; no `/admin/users/[id]` | Partial |
| `/admin/mentors` `mentors/page.tsx` | Search, pills, mentors table | `INITIAL_MENTORS` | "Course access" and "…" → `alert()` | Partial |
| `/admin/students` `students/page.tsx` | Search, pills, table with progress bar | `INITIAL_STUDENTS` (all Junior/Active) | "…" → `alert()` | Partial |
| `/admin/divisions` `divisions/page.tsx` | Junior/Senior cards with toggle, description, save | two `useState<DivisionData>` | "View students & mentors" and "Save" → `alert()`; **bug at line 29: Senior description says "Junior … S1–S3"** | Complete (static) |
| `/admin/courses` `courses/page.tsx` | 4 summary cards, course table, edit modal | `INITIAL_COURSES` | Save updates local state only; "View" → `alert()`; enrolled totals contradict each other (2,040 vs 2,480) | Partial |
| `/admin/assignments` `assignments/page.tsx` | Search, 8 status pills, table | `INITIAL_ASSIGNMENTS` | No row actions or detail page; "Closed" pill can never match; placeholder says "Search students…"; **header says "Create official assignments", but creation is mentor-only** | Partial |
| `/admin/results` `results/page.tsx` | Per-assignment publication table | `RESULTS_DATA` | "Review & Publish" → `alert()`; only row id 3 navigates | Partial |
| `/admin/results/[id]` `results/[id]/page.tsx` | Metrics, reviews table | `REVIEWS_DATA` | **`id` ignored**; banner counts contradict the table; no approve/publish actions | Partial |
| `/admin/reports` `reports/page.tsx` | 4 filter selects, 4 report cards | literal props ("sample dataset in this prototype") | Filters change nothing; no CSV export | Partial |
| `/admin/audit-log` `audit-log/page.tsx` | Search, category pills, log table | `INITIAL_LOGS` | No pagination/detail/export; categories "Access"/"System" don't exist in the backend | Partial |

### 3.2 Mentor (`app/mentor/`)

| Route / file | UI | Data source | Dead / broken controls | Verdict |
|---|---|---|---|---|
| `/mentor/dashboard` `dashboard/page.tsx` | 4 stats, recent activity, deadlines, quick actions | `stats`, `recentActivity`, `upcomingDeadlines` | All 3 quick actions have no handler | Partial |
| `/mentor/students` `students/page.tsx` | Stats, filters, student cards | `mockStudents` | Unlinked; filters never applied; mail/menu buttons dead | Partial (**no backend**) |
| `/mentor/assignments` `assignments/page.tsx` | Tabs, assignment cards | `mockAssignments` | Tabs never filter; "View all" dead; subtitle copy-paste ("Previous Olympiad papers"); detail page `[id]` not linked | Partial |
| `/mentor/assignments/create` | 6-step wizard | local `formData` | **No due-date field**; review step shows hardcoded values; "Back to Assignments" goes to the dashboard; course list includes "Calculus" | Partial |
| `/mentor/assignments/create/instructions` | **Near-copy of `create`** (differs only in 4 classNames) | local | Not linked from anywhere | Duplicate |
| `/mentor/assignments/create/resources` | Refactored wizard (single controlled `formData`, clickable stepper) | local | "Publish Assignment" does nothing; not linked | Partial (best base) |
| `/mentor/assignments/[id]` `[id]/page.tsx` | Detail, stats, quick actions | literals; **`id` ignored** | Edit/Delete dead; orphaned | Partial |
| `/mentor/assignments/[id]/assignmentReview` (+`[submissionId]`) | Submission table, controls, sidebar; grading page with FeedbackEditor, ScoreInput, SubmissionActions | `assignmentData`, `mockStudents`, `submissionData` | Links to missing `/mentor/assignments/[id]/edit`; **Review/View labels inverted**; score/feedback never collected; "Send Feedback" implies it goes directly to students | Partial (primary tree) |
| `/mentor/assignments/[id]/submissions` (+`[submissionId]`) | **Near-duplicate of `assignmentReview`**; its back-link points into the other tree | same | same | Duplicate |
| `/mentor/courses` `courses/page.tsx` → `CoursesContent`, `OverviewTab` (933 lines), `BooksTab`, `PastPapersTab` | Tabs; analytics sub-tabs; books/past-papers lists | `initialBooks`, `initialPapers`, `studentsData`, `chartData`, `topStudents` | No course/division selector; 6× `href="#"` in `OverviewTab.tsx`; Books sort does nothing; "Upload Past Paper" dead; "lessons" and "Live Session" items | Partial |
| `/mentor/courses/upload-book` | Upload form | local | Submit only `console.log`s; "Resource Type" is a file format (PDF/PNG/JPG), not the backend `ResourceType` | Complete form, unwired |
| `/mentor/courses/studentlist` | Criteria filter builder + preview | `mockStudents` | Criteria never filter; Refresh dead | Partial (**no backend**) |
| `/mentor/courses/studentlist/message` (+`/success`) | Compose message flow | local | "Go to conversations" → **missing `/mentor/conversations`** | Complete flow (**no backend**) |
| `/mentor/live-sessions` `live-sessions/page.tsx` (645 lines) | Sessions list + 4-step schedule modal | `mockSessions` | Join/Recording dead | **Obsolete** |

### 3.3 Student (`app/student/`)

| Route / file | UI | Data source | Dead / broken controls | Verdict |
|---|---|---|---|---|
| `/student/dashboard` `dashboard/page.tsx` (server) | Welcome, 4 course cards, current assignments, ranking card, calendar, alerts | inline literals | Calendar arrows dead; `<button>` nested in `<Link>`; rank #4 here vs #12 on the leaderboard | Complete (static) |
| `/student/courses` `courses/page.tsx` | 4 course cards | `courses[]` (invented slugs, code "DV2008" for all) | Nested button-in-link | Complete (static) |
| `/student/courses/[course]` | Overview / Books / Past Papers tabs (link-based), mentor card | `courseData: Record<string, any>` keyed by slug | Invalid slug silently falls back to geometry; "Ask a question" dead; resources not downloadable; `CourseTabs.tsx` imported but unused; "Advanced Division / S5–S6" is not a real division | Partial |
| `/student/assignments` + `components/*` | Search, filter dropdown (works locally), sort, table | `assignments[]` in `AssignmentsContent.tsx` | Search and sort dead; statuses don't match backend labels; non-backend subjects (Calculus, Real Analysis…) | Partial |
| `/student/assignments/[id]` (+`SubmissionPanel`, `StepCheckbox`) | Assignment / Discussion / Results tabs, submission panel with confirm/success modals | `sampleAssignment`, `mockComments`; **`id` ignored** | Upload box has no `<input type=file>`; empty submissions allowed; discussion Post/Reply/reactions dead; Results tab shown before publication | Partial |
| `/student/assignments/results` | Course select, sort, results table | `mockResults` | Selects/Apply/Sort dead; rows not clickable; course list contains non-backend courses | Partial |
| `/student/leaderboard` + `components/*` | Podium, rank bar, list, National/Study Group toggle | `topThree`, `rankings` | Toggle affects nothing and prints a debug line "Current filter: …"; Prev/Next dead | Partial |
| `/student/live-sessions` | Upcoming/past sessions | `mockSessions` | Join/Recording dead | **Obsolete** |

## 4. Cross-cutting issues

1. **No authentication or authorization.** All three portals are openly reachable, and there is no login.
2. **Terminology drift from the domain model:**
   - Courses: Calculus, Trigonometry, Linear Algebra and "Geometry 101" appear alongside the real 4 courses.
   - "Learning Circle", "Cohort" and G10–G12 are used instead of Division (JUNIOR/SENIOR) and GradeLevel S1–S6.
   - Assignment and submission statuses are ad hoc and don't match backend enums or student `displayStatus` labels.
   - "Instructor" is used instead of "Mentor".
3. **Mock data contradicts itself across pages:** user names, counts, ranks and e-mail domains all disagree.
4. **Duplicated code:**
   - Two submission-review trees.
   - Three assignment wizards.
   - Three Navbar/Sidebar pairs.
   - Repeated filter-pill, search and table markup in every admin list.
5. **Dynamic routes ignore their params:** `student/assignments/[id]`, `mentor/assignments/[id]`, `admin/results/[id]`.
6. **No loading, error, or empty states**, apart from "no matches" in a few tables. There is no `notFound()` handling.
7. **Accessibility:** `<button>` nested in `<Link>`, clickable `<div>`s, raw `<img>` with remote Unsplash avatars.
8. **Lint/typecheck not verified**, because dependencies aren't installed. No obvious TypeScript errors were found by inspection; there are some unused imports.

## 5. What is worth preserving

- The visual design and page compositions in all three portals.
- The shell and sidebar pattern.
- The admin list-page pattern (search + pills + table).
- The student assignment detail layout (tabs + submission panel + confirm/success modals).
- The mentor grading page layout (file card, feedback editor, score input, actions).
- The refactored wizard in `create/resources/page.tsx`.
- The Books and Past Papers tabs.
- The leaderboard podium.

These should be **wired to real data rather than rewritten**.
