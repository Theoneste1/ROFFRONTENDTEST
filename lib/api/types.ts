/**
 * Types for the ROF LMS API (ROFBACKENDTEST, base path /api/v1).
 *
 * Shapes follow the backend's recorded responses in
 * ROFBACKENDTEST/docs/api/response-schemas.json and its Prisma enums.
 * Add types here as modules are integrated; keep them in one place.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

/**
 * The backend's six user types (MENTOR is shown as "Coach"). The production
 * backend still returns only STUDENT, MENTOR and ADMIN; code that branches on
 * a role must also cope with an unknown value (see lib/auth/role-rules.ts).
 */
export type Role = "STUDENT" | "TEACHER" | "MENTOR" | "HEAD_COACH" | "ADMIN" | "SUPER_ADMIN";
export type DivisionCode = "JUNIOR" | "SENIOR";
export type GradeLevel = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

/** Permission strings from `GET /me/permissions` (src/auth/permissions.ts). */
export type Permission =
  | "courses.view" | "courses.complete" | "resources.view" | "resources.manage"
  | "assignments.view" | "assignments.prepare" | "assignments.publish"
  | "submissions.submit" | "submissions.viewOwn" | "submissions.distribute"
  | "reviews.grade" | "results.approve" | "results.publish"
  | "discussions.participate" | "discussions.report" | "discussions.moderate"
  | "analytics.course" | "leaderboard.view" | "reports.export"
  | "users.manage" | "academicYears.manage" | "enrollments.manage"
  | "divisions.manage" | "courses.manage" | "mentorAssignments.manage"
  | "mentorRequests.decide" | "settings.manage" | "email.bulkSend"
  | "audit.view" | "activity.view";

// ─── Common shapes ──────────────────────────────────────────────────────────

/** Paginated list response: `?page=&limit=` (limit ≤ 100). */
export interface Page<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PageParams {
  page?: number;
  limit?: number;
}

/** The single error shape every endpoint returns. */
export interface ApiErrorBody {
  statusCode: number;
  error?: string;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  path?: string;
  timestamp?: string;
}

export interface DivisionRef {
  id: string;
  code: DivisionCode;
  name: string;
}

export interface SchoolRef {
  id: string;
  name: string;
  location: string;
}

// ─── Identity ───────────────────────────────────────────────────────────────

/** `GET /me` and the `user` of `POST /auth/login`. */
export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatarUrl: string | null;
  division: DivisionRef | null;
  gradeLevel: GradeLevel | null;
  school: SchoolRef | null;
  homeLocation: string | null;
  points: number;
  problemsSolved: number;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * `GET /me/permissions`. Production returns `{ role, permissions }`; the next
 * backend adds `roleLabel`, `scopes` and `overrides` (optional here, so both work).
 * For STUDENT, MENTOR and ADMIN the backend keeps the original permission list,
 * which does not list newer administrative permissions — do not rely on it for those.
 */
export interface MePermissions {
  role: Role;
  permissions: Permission[];
  roleLabel?: string | null;
  scopes?: {
    courseDivisions?: { courseId: string; divisionId: string }[];
    programmes?: string[];
  };
  overrides?: {
    permission: string;
    effect: "GRANT" | "DENY";
    courseId: string | null;
    divisionId: string | null;
    expiresAt: string | null;
  }[];
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_at: string;
}

export interface LoginResponse extends TokenResponse {
  user: CurrentUser;
}

export interface MessageResponse {
  message: string;
}

/** `POST /auth/activation/inspect`. */
export interface ActivationInfo {
  purpose: string;
  requiresPassword: boolean;
  firstName: string;
  username: string;
  /** Masked by the backend. */
  email: string;
  expiresAt: string;
}

export interface ActivateResponse {
  message: string;
  username: string;
}

/** `GET /support` (public). */
export interface SupportInfo {
  platformName?: string | null;
  email?: string | null;
  phone?: string | null;
  hours?: string | null;
  helpUrl?: string | null;
  message?: string | null;
}

// ─── Learning: courses and resources ────────────────────────────────────────

export type CourseCode = "ALGEBRA" | "GEOMETRY" | "NUMBER_THEORY" | "COMBINATORICS";
export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type CourseEnrollmentStatus = "UNROLLED" | "ROLLED" | "COMPLETED";
export type ResourceType = "BOOK" | "EBOOK" | "NOTE" | "PAST_PAPER" | "ATTACHMENT";

export interface CourseRef {
  id: string;
  code: CourseCode;
  title: string;
}

/** `GET /courses` (array) and `GET /courses/:id`. */
export interface Course extends CourseRef {
  description: string | null;
  status: CourseStatus;
  sortOrder: number;
  discussionsEnabled: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  discipline: { id: string; code: string; name: string };
  /** Student view only. */
  enrollmentStatus?: CourseEnrollmentStatus;
  displayStatus?: string;
  completedAt?: string | null;
  counts: { resources: number; assignments: number };
}

/** `GET /me/courses`. */
export interface MyCourse {
  course: CourseRef;
  status: CourseEnrollmentStatus;
  displayStatus: string;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  completedAt: string | null;
}

export interface CourseCompletion {
  courseId: string;
  alreadyCompleted: boolean;
  completedAt: string;
  enrollmentStatus: CourseEnrollmentStatus;
  displayStatus: string;
}

export interface FileRef {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface Attachment {
  id: string;
  sortOrder: number;
  file: FileRef;
  /** Present on result feedback files. */
  downloadPath?: string;
}

/** `GET /courses/:courseId/resources` (array) and `…/:resourceId`. */
export interface CourseResource {
  id: string;
  courseId: string;
  divisionId: string;
  division: DivisionRef;
  type: ResourceType;
  title: string;
  description: string | null;
  author: string | null;
  source: string | null;
  year: number | null;
  tags: string[];
  sortOrder: number;
  isPublished: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  /** Staff view. */
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
}

// ─── Assessment ─────────────────────────────────────────────────────────────

export type AssignmentStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "REJECTED" | "CLOSED" | "ARCHIVED";

export type SubmissionStatus =
  | "SUBMITTED" | "ASSIGNED" | "IN_REVIEW" | "MARKED" | "SUBMITTED_TO_ADMIN"
  | "APPROVED" | "PUBLISHED" | "REJECTED" | "RESUBMISSION_REQUESTED";

/** The labels the backend gives students (`displayStatus`). */
export type StudentDisplayStatus = "Not Started" | "Submitted" | "Pending Review" | "Resubmission Requested" | "Reviewed";

/** `GET /me/assignments` items and `GET /assignments/:id` (student view). */
export interface StudentAssignment {
  id: string;
  title: string;
  description: string | null;
  instructions: string;
  deadline: string;
  points: number;
  maximumMarks: number;
  allowResubmission: boolean;
  maxResubmissions: number;
  allowLateSubmission: boolean;
  status: AssignmentStatus;
  publishedAt: string | null;
  resultsPublishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  courseId: string;
  divisionId: string;
  attachments: Attachment[];
  academicYear: { id: string; name: string };
  course: CourseRef;
  division: DivisionRef;
  createdBy: { id: string; username: string | null; firstName: string; lastName: string } | null;
  displayStatus: StudentDisplayStatus;
  submission: {
    id: string;
    revisionCount: number;
    submittedAt: string;
    isLate: boolean;
    resubmissionDueAt: string | null;
  } | null;
  viewedAt?: string | null;
  canSubmit: boolean;
}

export interface SubmissionRevision {
  id: string;
  revisionNumber: number;
  note: string | null;
  answerText: string | null;
  isLate: boolean;
  submittedAt: string;
  attachments: Attachment[];
}

/** `GET /submissions/:id`, `GET /me/submissions` items, `POST /submissions`. */
export interface Submission {
  id: string;
  status: SubmissionStatus;
  displayStatus: StudentDisplayStatus;
  assignment: {
    id: string;
    title: string;
    maximumMarks: number;
    points: number;
    deadline: string;
    allowResubmission: boolean;
    maxResubmissions: number;
    courseId: string;
    divisionId: string;
    status: AssignmentStatus;
    course: CourseRef;
    division: DivisionRef;
  };
  answerText: string | null;
  files: Attachment[];
  revisionCount: number;
  isLate: boolean;
  submittedAt: string;
  revisions: SubmissionRevision[];
  resubmissionRequest: { note: string; dueAt: string; requestedAt?: string } | null;
  createdAt: string;
  result?: {
    score: number;
    maximumMarks: number;
    percentage: number;
    pointsAwarded: number;
    mentorFeedback: string | null;
    feedbackFiles: Attachment[];
  } | null;
}

/** An event in the resubmission-request log (`requested`, `withdrawn`, …). */
export interface ResubmissionRequestEvent {
  type: string;
  note: string;
  at: string;
  by?: { id: string; firstName: string; lastName: string; username: string | null };
}

/** `GET /submissions/:id/history`. */
export interface SubmissionHistory {
  submissionId: string;
  status: SubmissionStatus;
  displayStatus: StudentDisplayStatus;
  attempts: SubmissionRevision[];
  resubmissionRequests: ResubmissionRequestEvent[];
  /** The request the student must answer now, if any. */
  openRequest: { note: string; dueAt: string; requestedAt?: string } | null;
}

/** `GET /me/results` items. */
export interface ResultSummary {
  submissionId: string;
  assignment: {
    id: string;
    title: string;
    description: string | null;
    deadline: string;
    maximumMarks: number;
    points: number;
    course: CourseRef;
    division: DivisionRef;
    academicYear: { id: string; name: string };
  };
  score: number;
  maximumMarks: number;
  percentage: number;
  pointsAwarded: number;
  reviewedAt: string | null;
  publishedAt: string;
}

/** `GET /me/results/:submissionId`. */
export interface ResultDetail extends ResultSummary {
  submission: {
    submittedAt: string;
    isLate: boolean;
    attempts: number;
    answerText: string | null;
    note: string | null;
    files: Attachment[];
  };
  feedback: {
    text: string | null;
    mentor: { firstName: string; lastName: string } | null;
    files: Attachment[];
  };
  previousVersions: Array<{ score: number; maximumMarks: number; percentage: number; publishedAt: string; supersededAt?: string }>;
  repliesAllowed: boolean;
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  id: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  problemsSolved: number;
  school: { id: string; name: string } | null;
  isMe: boolean;
}

export interface LeaderboardPage extends Page<LeaderboardEntry> {
  divisionId: string;
}

export interface MyRank {
  divisionId: string;
  rank: number;
  outOf: number;
  points: number;
  problemsSolved: number;
}

export interface SchoolRankEntry {
  rank: number;
  schoolId: string;
  schoolName: string;
  schoolLocation: string;
  totalPoints: number;
  studentCount: number;
  averagePoints: number;
}

export interface SchoolLeaderboardPage extends Page<SchoolRankEntry> {
  divisionId: string;
}

// ─── Discussions ────────────────────────────────────────────────────────────

export type ThreadStatus = "OPEN" | "LOCKED" | "HIDDEN" | "ARCHIVED" | "DELETED";
export type CommentStatus = "ACTIVE" | "HIDDEN" | "DELETED";
export type ReactionType = "LIKE" | "HELPFUL" | "CONFUSED";
export type ReportReason = "SPAM" | "ABUSE" | "INAPPROPRIATE" | "OFF_TOPIC" | "ACADEMIC_DISHONESTY" | "OTHER";

export interface DiscussionAuthor {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: Role;
}

/** The opening post is the thread's first comment. */
export interface DiscussionThread {
  id: string;
  title: string;
  status: ThreadStatus;
  isPinned: boolean;
  courseId: string | null;
  assignmentId: string | null;
  divisionId: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: DiscussionAuthor | null;
  _count: { comments: number };
}

export interface DiscussionComment {
  id: string;
  threadId: string;
  parentId: string | null;
  content: string;
  status: CommentStatus;
  author: DiscussionAuthor | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  reactions: Partial<Record<ReactionType, number>>;
  myReactions: ReactionType[];
  replyCount: number;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export type NotificationCategory = "ASSIGNMENTS" | "SUBMISSIONS" | "REVIEWS" | "RESULTS" | "RESOURCES" | "ACCOUNT" | "DISCUSSIONS";

export interface AppNotification {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Ids for deep links (assignmentId, submissionId, threadId, …); may be null. */
  data: Record<string, string | undefined> | null;
  /** Role-neutral or role-prefixed frontend path; null when there is nothing to open. */
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  category?: NotificationCategory;
}

/** `GET /notifications/unread-count`. */
export interface UnreadCount {
  unread: number;
  byCategory: Record<NotificationCategory, number>;
}

/** `GET /me/notification-preferences`: e-mail on or off per category (ACCOUNT is locked on). */
export interface NotificationPreference {
  category: NotificationCategory;
  emailEnabled: boolean;
  locked: boolean;
}

/** One switchable notification type (`GET /me/notification-settings`, mentors and admins). */
export interface NotificationSetting {
  type: string;
  category: NotificationCategory;
  label: string;
  description: string;
  inAppEnabled: boolean;
  /** false: in-app only, never e-mailed (no e-mail switch). */
  emailAvailable: boolean;
  emailEnabled: boolean;
  /** The category e-mail preference, which also gates this type's e-mail. */
  categoryEmailEnabled: boolean;
}

/** `PATCH /me`: the only profile fields a user may change. */
export interface UpdateMeInput {
  firstName?: string;
  lastName?: string;
  homeLocation?: string;
}

// ─── Mentor ─────────────────────────────────────────────────────────────────

/** `GET /me/teaching`: a course × division the mentor is assigned to. */
export interface TeachingScope {
  id: string;
  course: CourseRef;
  division: DivisionRef;
  createdAt: string;
}

/** `GET /assignments` items and `GET /assignments/:id` (staff view). */
export interface MentorAssignment {
  id: string;
  title: string;
  description: string | null;
  instructions: string;
  deadline: string;
  points: number;
  maximumMarks: number;
  allowResubmission: boolean;
  maxResubmissions: number;
  allowLateSubmission: boolean;
  status: AssignmentStatus;
  publishedAt: string | null;
  resultsPublishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string | null;
  rejectedAt?: string | null;
  rejectionNote?: string | null;
  courseId: string;
  divisionId: string;
  attachments: Attachment[];
  academicYear: { id: string; name: string };
  course: CourseRef;
  division: DivisionRef;
  createdBy: { id: string; username: string | null; firstName: string; lastName: string } | null;
  approvedBy?: { id: string; firstName: string; lastName: string } | null;
  _count?: { submissions: number };
}

/** `GET /assignments/:id/history`. */
export interface AssignmentEvent {
  id: string;
  type: string;
  fromStatus: AssignmentStatus | null;
  toStatus: AssignmentStatus | null;
  note: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
  actor: { id: string; username: string | null; firstName: string; lastName: string; role: Role } | null;
}

export type ReviewStatus = "ASSIGNED" | "IN_PROGRESS" | "MARKED" | "RETURNED" | "SENT_BACK" | "APPROVED" | "PUBLISHED" | "SUPERSEDED" | "CANCELLED" | "RESUBMISSION_REQUESTED";

/** The current review cycle as embedded in a submission (`review`). */
export interface CurrentReview {
  id: string;
  cycle: number;
  status: ReviewStatus;
  score: number | null;
  percentage: number | null;
  feedback: string | null;
  attachments: Attachment[];
  assignedAt: string | null;
  startedAt: string | null;
  markedAt: string | null;
  returnedAt: string | null;
  /** Admin's reason when a review is sent back. */
  decisionNote: string | null;
}

/** `GET /mentor/reviews` items and `GET /submissions/:id` (mentor view). */
export interface ReviewSubmission extends Omit<Submission, "displayStatus" | "result"> {
  displayStatus?: StudentDisplayStatus;
  student: { id: string; username: string | null; firstName: string; lastName: string; gradeLevel: GradeLevel | null };
  review: CurrentReview | null;
}

/** `GET /submissions/:id/reviews`: every review cycle with its events. */
export interface ReviewCycle {
  id: string;
  cycle: number;
  status: ReviewStatus;
  score: number | null;
  percentage: number | null;
  feedback: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  markedAt: string | null;
  returnedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  publishedAt: string | null;
  mentor: { id: string; username: string | null; firstName: string; lastName: string } | null;
  attachments: Attachment[];
  events: { id: string; type: string; score: number | null; note: string | null; createdAt: string; actor: { firstName: string; lastName: string } | null }[];
}

/** `GET /analytics/courses/:courseId?divisionId=`. */
export interface CourseAnalytics {
  course: CourseRef;
  division: DivisionRef;
  generatedAt: string;
  students: { total: number; unrolled: number; rolled: number; completed: number; completionRate: number };
  assignments: {
    id: string;
    title: string;
    deadline: string;
    resultsPublishedAt: string | null;
    submissions: number;
    submissionRate: number;
    lateSubmissions: number;
    publishedResults: number;
    averagePercentage: number | null;
    medianPercentage: number | null;
    highestPercentage: number | null;
    lowestPercentage: number | null;
    distribution: { range: string; count: number }[];
    averageReviewHours: number | null;
  }[];
  reviewPipeline: Partial<Record<SubmissionStatus, number>>;
  resources: {
    published: number;
    uniqueViewers: number;
    totalViews: number;
    mostViewed: { id: string; title: string; type: ResourceType; uniqueViewers: number }[];
  };
}

// ─── Admin ──────────────────────────────────────────────────────────────────
// Shapes from ROFBACKENDTEST/docs/api/response-schemas.json (admin routes).

/** Common report filters (`/admin/dashboard`, `/admin/reports/*`). */
export interface ReportFilters {
  academicYearId?: string;
  divisionId?: string;
  courseId?: string;
  /** ISO date. */
  from?: string;
  to?: string;
}

export interface PersonRef {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string;
}

/** `GET /admin/dashboard`. */
export interface AdminDashboard {
  generatedAt: string;
  students: {
    total: number;
    active: number;
    inactive: number;
    awaitingSetup: number;
    registeredInRange: number;
    byDivision: { id: string; code: DivisionCode; name: string; students: number }[];
    byCourse: { id: string; code: CourseCode; title: string; participating: number; completed: number }[];
  };
  mentors: {
    total: number;
    active: number;
    inactive: number;
    awaitingSetup: number;
    activity: {
      mentorsWithCompletedReviews: number;
      mostReviewsCompleted: { mentor: PersonRef & { lastLoginAt: string | null }; reviewsCompleted: number; openReviews: number }[];
    };
  };
  assignments: { byStatus: Partial<Record<AssignmentStatus, number>>; published: number };
  submissions: { total: number; late: number; byStatus: Partial<Record<SubmissionStatus, number>> };
  reviews: {
    awaitingDistribution: number;
    pendingMentorReview: number;
    awaitingAdminApproval: number;
    completed: number;
    pendingByStatus: Partial<Record<ReviewStatus, number>>;
  };
  results: { awaitingPublication: number; published: number };
  reportedContent: { open: number; total: number; byStatus: Record<string, number>; byReason: Record<string, number> };
  accountsAwaitingSetup: {
    total: number;
    byRole: { STUDENT: number; MENTOR: number };
    mentorApplications: number;
    studentsAwaitingApproval: number;
  };
}

/** `GET /admin/reports/overview`. */
export interface ReportsOverview {
  generatedAt: string;
  actionRequired: {
    assignmentsAwaitingApproval: number;
    submissionsToDistribute: number;
    reviewsAwaitingApproval: number;
    resultsReadyToPublish: number;
    mentorApplications: number;
    studentsAwaitingApproval: number;
    failedEmails: number;
  };
  activeUsers: Partial<Record<Role, number>>;
  assignments: Partial<Record<AssignmentStatus, number>>;
  submissions: Partial<Record<SubmissionStatus, number>>;
  studentsByDivision: { id: string; code: DivisionCode; name: string; students: number }[];
}

export type AuditCategory =
  | "USERS" | "ENROLLMENT" | "MENTOR_ASSIGNMENTS" | "ASSIGNMENTS" | "SUBMISSIONS" | "DISTRIBUTION"
  | "REVIEWS" | "RESULTS" | "MODERATION" | "SETTINGS" | "ACADEMIC_YEARS" | "COURSES" | "SECURITY"
  | "DATA_EXPORTS" | "STUDY_GROUPS" | "OTHER";

/** `GET /admin/audit-logs` items (append-only). */
export interface AuditLogEntry {
  id: string;
  action: string;
  category: AuditCategory;
  entity: string;
  entityId: string | null;
  actorRole: Role | null;
  actorUsername: string | null;
  actor: (PersonRef & { role: Role }) | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** `GET /admin/users` items, `GET /admin/users/:id`. Admins see e-mail addresses. */
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  isApproved: boolean;
  /** null until the account is activated (invited accounts). */
  activatedAt: string | null;
  avatarUrl: string | null;
  division: DivisionRef | null;
  gradeLevel: GradeLevel | null;
  school: SchoolRef | null;
  homeLocation: string | null;
  points: number;
  problemsSolved: number;
  provider?: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

/** `POST /admin/users/import` (multipart CSV, `?dryRun=`). */
export interface UserImportResult {
  dryRun: boolean;
  totalRows: number;
  valid: number;
  created: number;
  failed: number;
  errors: { row: number; email: string; errors: string[] }[];
  users: { row: number; id: string; email: string; username: string; role: Role }[];
}

/** `GET /admin/divisions`. */
export interface AdminDivision {
  id: string;
  code: DivisionCode;
  name: string;
  description: string | null;
  isActive: boolean;
  gradeLevels: GradeLevel[];
  _count: { students: number; mentorAssignments: number };
}

/** `GET /schools` items (admin). */
export interface SchoolSummary {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  _count: { students: number };
}

/** `GET /schools/:id` (admin): the school and a page of its students. */
export interface SchoolDetail {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  students: Page<{ id: string; username: string; firstName: string; lastName: string; gradeLevel: GradeLevel | null; isActive: boolean; points: number; division: { code: DivisionCode; name: string } | null }>;
}

/** Report row status (`/admin/reports/students|mentors`). */
export type ReportUserStatus = "ACTIVE" | "INACTIVE" | "AWAITING_SETUP";

export interface ScopeRef {
  course: CourseRef;
  division: DivisionRef;
}

/** `GET /admin/reports/mentors` items. */
export interface MentorReportRow {
  id: string;
  name: string;
  username: string;
  email: string;
  status: ReportUserStatus;
  teaching: ScopeRef[];
  openReviews: number;
  registeredAt: string;
  activatedAt: string | null;
  lastLoginAt: string | null;
}

/** `GET /admin/mentor-assignments` items: a mentor's course × division access. */
export interface MentorScope {
  id: string;
  isActive: boolean;
  course: CourseRef;
  division: DivisionRef;
  mentor: { id: string; username: string; firstName: string; lastName: string; email: string };
  assignedBy: { id: string; username: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type MentorRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** `GET /mentor-requests` items (public application form). */
export interface MentorRequest {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  status: MentorRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MentorRequestApproval {
  request: { id: string; status: MentorRequestStatus };
  mentor: { id: string; username: string; email: string; firstName: string; lastName: string; role: Role };
  emailVerificationRequired: boolean;
  next: string;
}

/** `GET /admin/reports/students` items. */
export interface StudentReportRow {
  id: string;
  name: string;
  username: string;
  email: string;
  gradeLevel: GradeLevel | null;
  division: DivisionRef | null;
  school: { id: string; name: string } | null;
  status: ReportUserStatus;
  enrollmentStatus: string | null;
  submissions: number;
  resultsPublished: number;
  points: number;
  registeredAt: string;
  activatedAt: string | null;
  lastLoginAt: string | null;
}

/** `GET /admin/reports/course-participation` rows (course × division). */
export interface CourseParticipationRow {
  course: CourseRef;
  division: DivisionRef;
  students: number;
  opened: number;
  completed: number;
  participationRate: number;
  assignmentsPublished: number;
  submissions: number;
  studentsSubmitted: number;
  submissionRate: number;
  averageScore: number | null;
  discussionThreads: number;
  discussionComments: number;
}

/** Review stage counts used by the assignment and results reports. */
export interface ReviewStageCounts {
  awaitingDistribution: number;
  inReview: number;
  awaitingApproval: number;
  approved: number;
  published: number;
  resubmissionRequested: number;
}

/** `GET /admin/reports/assignments` items. */
export interface AssignmentReportRow {
  id: string;
  title: string;
  status: AssignmentStatus;
  course: CourseRef;
  division: DivisionRef;
  academicYear: { id: string; name: string };
  deadline: string;
  publishedAt: string | null;
  maximumMarks: number;
  expectedStudents: number;
  submitted: number;
  onTime: number;
  late: number;
  notSubmitted: number;
  submissionRate: number;
  averageScore: number | null;
  byStage: ReviewStageCounts;
}

/** The current review as the administrator sees it (includes the mentor and coordination fields). */
export interface AdminReview extends CurrentReview {
  mentor: PersonRef | null;
  coordinationNote: string | null;
  decidedAt: string | null;
  publishedAt: string | null;
}

/** `GET /submissions` items and `GET /submissions/:id` (admin view). */
export interface AdminSubmission extends Omit<ReviewSubmission, "review"> {
  review: AdminReview | null;
  publishedReview: AdminReview | null;
  resultRelease: { id: string; publishedAt: string } | null;
  pointsAwarded: number | null;
  publishedAt: string | null;
}

export type DistributionStrategy = "BALANCED" | "ROUND_ROBIN";

/** `POST /assignments/:id/distribute`. */
export interface DistributionResult {
  batchId: string;
  strategy: DistributionStrategy;
  distributed: number;
  /** mentorId → number of submissions assigned. */
  byMentor: Record<string, number>;
}

/** `GET /assignments/:id/distribution-batches`. */
export interface DistributionBatch {
  id: string;
  assignmentId: string;
  strategy: DistributionStrategy;
  assignedCount: number;
  createdAt: string;
  createdBy: { id: string; username: string } | null;
  reviews: { id: string; submissionId: string; status: ReviewStatus; mentor: { id: string; username: string } | null }[];
}

/** `GET /admin/reports/results-publication` items. */
export interface ResultsPublicationRow {
  id: string;
  title: string;
  status: AssignmentStatus;
  course: CourseRef;
  division: DivisionRef;
  academicYear: { id: string; name: string };
  deadline: string;
  maximumMarks: number;
  submissions: number;
  awaitingApproval: number;
  awaitingPublication: number;
  published: number;
  releases: number;
  averageScore: number | null;
  publishedAt: string | null;
  lastPublishedAt: string | null;
  lastPublishedBy: PersonRef | null;
}

/** `GET /assignments/:id/result-releases`. */
export interface ResultRelease {
  id: string;
  assignmentId: string;
  note: string | null;
  publishedAt: string;
  publishedBy: { id: string; username: string } | null;
  resultCount: number;
  submissions: { id: string; status: SubmissionStatus; studentId: string }[];
}

/** `GET /submissions/:id/result-history`. */
export interface ResultHistory {
  submissionId: string;
  status: SubmissionStatus;
  currentRelease: { id: string; note: string | null; publishedAt: string; publishedBy: PersonRef | null } | null;
  publications: {
    reviewId: string;
    cycle: number;
    score: number;
    percentage: number;
    mentor: PersonRef | null;
    reviewedAt: string | null;
    publishedAt: string;
    publishedBy: PersonRef | null;
    withdrawn: { at: string; by: PersonRef | null; note: string } | null;
  }[];
}

/** `GET /admin/reports/reviews`. */
export interface ReviewsReport {
  pending: {
    total: number;
    awaitingDistribution: number;
    awaitingAdminApproval: number;
    byStatus: Partial<Record<ReviewStatus, number>>;
    byAge: { underTwoDays: number; twoToSevenDays: number; overSevenDays: number };
    oldestAssignedAt: string | null;
  };
  completed: {
    total: number;
    approvedByAdmin: number;
    sentBackByAdmin: number;
    published: number;
    averageTurnaroundHours: number | null;
    medianTurnaroundHours: number | null;
  };
}

export type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export interface ModerationPerson extends PersonRef {
  role: Role;
  avatarUrl: string | null;
}

/** `GET /admin/moderation/reports` items. */
export interface ModerationReport {
  id: string;
  targetType: "THREAD" | "COMMENT";
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  /** The reported text as it was when reported. */
  contentSnapshot: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolvedBy: PersonRef | null;
  reporter: ModerationPerson | null;
  comment: { id: string; content: string; status: string; deletedAt: string | null; editedAt: string | null; author: ModerationPerson | null } | null;
  thread: { id: string; title: string; status: string; courseId: string | null; assignmentId: string | null; divisionId: string | null; deletedAt: string | null; createdBy: ModerationPerson | null } | null;
}

export interface ModerationReportDetail extends ModerationReport {
  otherReports: { id: string; reason: ReportReason; details: string | null; status: ReportStatus; createdAt: string; reporter: ModerationPerson | null }[];
  moderationHistory: { id?: string; action?: string; reason?: string | null; createdAt?: string }[];
}

/** `GET /admin/moderation/actions` items. */
export interface ModerationAction {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string;
  moderator: ModerationPerson | null;
  comment: { id: string; content: string; status: string } | null;
  thread: { id: string; title: string; status: string } | null;
  report: { id: string; reason: ReportReason } | null;
}

/** `GET /admin/comments/hidden` items. */
export interface HiddenComment {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  author: ModerationPerson | null;
  thread: { id: string; title: string };
  _count: { replies: number };
}

export type SettingType = "boolean" | "string" | "enum" | "integer" | "email" | "url";
export type SettingValue = boolean | number | string | null;

/** `GET /admin/settings` items (registry metadata + current value). */
export interface PlatformSetting {
  key: string;
  category: "REGISTRATION" | "ASSIGNMENTS" | "NOTIFICATIONS" | "PLATFORM" | "SUPPORT";
  type: SettingType;
  description: string;
  value: SettingValue;
  default: SettingValue;
  options?: string[];
  nullable?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  unit?: string;
  updatedAt: string | null;
  updatedBy: PersonRef | null;
}
