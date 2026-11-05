/**
 * Types for the ROF LMS API (ROFBACKENDTEST, base path /api/v1).
 *
 * Shapes follow the backend's recorded responses in
 * ROFBACKENDTEST/docs/api/response-schemas.json and its Prisma enums.
 * Add types here as modules are integrated; keep them in one place.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export type Role = "STUDENT" | "MENTOR" | "ADMIN";
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

export interface MePermissions {
  role: Role;
  permissions: Permission[];
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
  data: Record<string, string | undefined>;
  link: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
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
