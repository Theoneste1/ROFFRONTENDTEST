/**
 * Query keys for TanStack Query. Every cached request is keyed here so that
 * mutations can invalidate exactly what they change.
 *
 * Convention: `[area, ...scope, params?]`. Invalidating a prefix such as
 * `queryKeys.me.all` refreshes everything below it.
 */
import type { MyAssignmentFilters, MyResultFilters } from "@/lib/api/assessment";
import type { ResourceFilters } from "@/lib/api/learning";
import type { ThreadScope } from "@/lib/api/community";
import type { AssignmentFilters, ReviewFilters } from "@/lib/api/mentor";
import type { AdminAssignmentFilters, AdminSubmissionFilters, AuditFilters, UserFilters, UserReportFilters } from "@/lib/api/admin";
import type { NotificationFilters, ReportFilters } from "@/lib/api/types";

export const queryKeys = {
  me: {
    all: ["me"] as const,
    profile: () => [...queryKeys.me.all, "profile"] as const,
    permissions: () => [...queryKeys.me.all, "permissions"] as const,
    /** Students: GET /me/school-affiliation. */
    schoolAffiliation: () => [...queryKeys.me.all, "school-affiliation"] as const,
  },
  /** Profile pictures by their API path (the path changes with every new picture: ?v=<file id>). */
  avatars: {
    image: (path: string) => ["avatars", path] as const,
  },
  /** Academic years and enrolments (lib/api/academic-years.ts). */
  academicYears: {
    all: ["academic-years"] as const,
    list: () => [...queryKeys.academicYears.all, "list"] as const,
    enrollments: (yearId: string, filters: object) => [...queryKeys.academicYears.all, "enrollments", yearId, filters] as const,
  },
  /** School directory administration (lib/api/school-directory.ts, `/admin/schools`). */
  schoolDirectory: {
    all: ["school-directory"] as const,
    list: (filters: object) => [...queryKeys.schoolDirectory.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.schoolDirectory.all, "detail", id] as const,
    students: (id: string, page: number) => [...queryKeys.schoolDirectory.all, "students", id, page] as const,
    /** Teacher assignments of the school (INT-07). */
    teachers: (id: string, filter: string, page: number) => [...queryKeys.schoolDirectory.all, "teachers", id, filter, page] as const,
    /** The school's primary teacher (primaryTeacher). */
    primaryTeacher: (id: string) => [...queryKeys.schoolDirectory.all, "teachers", id, "primary"] as const,
    history: (id: string, page: number) => [...queryKeys.schoolDirectory.all, "history", id, page] as const,
    contacts: (id: string, includeRemoved: boolean) => [...queryKeys.schoolDirectory.all, "contacts", id, includeRemoved] as const,
    offerings: (id: string) => [...queryKeys.schoolDirectory.all, "offerings", id] as const,
    referenceData: () => [...queryKeys.schoolDirectory.all, "reference-data"] as const,
    /** The public province → district → sector list (the same key the claim form uses). */
    locations: () => ["schools", "locations"] as const,
    /** The public search filtered by place (GET /schools/search?province=&district=). */
  },
  /** Teacher self-registration (lib/api/teacher-registration.ts). */
  teacherRegistration: {
    availability: () => ["teacher-registration", "availability"] as const,
  },
  /** Public form availability (GET /forms/:key). */
  forms: {
    public: (key: string) => ["forms", "public", key] as const,
  },
  /** Bulk user operations (lib/api/bulk-users.ts). */
  bulkUsers: {
    all: ["bulk-users"] as const,
    list: (filters: object) => [...queryKeys.bulkUsers.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.bulkUsers.all, "detail", id] as const,
    items: (id: string, filters: object) => [...queryKeys.bulkUsers.all, "items", id, filters] as const,
  },
  /** Teacher application review (`/admin/teacher-applications`). */
  teacherApplications: {
    all: ["teacher-applications"] as const,
    list: (filters: object) => [...queryKeys.teacherApplications.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.teacherApplications.all, "detail", id] as const,
  },
  /** Admin delivery log of the decision notifications (lib/api/notification-deliveries.ts). */
  notificationDeliveries: {
    all: ["notification-deliveries"] as const,
    list: (filters: object) => [...queryKeys.notificationDeliveries.all, "list", filters] as const,
  },
  /** Countries (lib/api/countries.ts): the public list and the administrators' screen. */
  countries: {
    all: ["countries"] as const,
    list: () => ["countries", "list"] as const,
    admin: () => ["countries", "admin"] as const,
  },
  /** Administrators' form management (lib/api/admin-forms.ts). */
  adminForms: {
    all: ["admin-forms"] as const,
    list: () => [...queryKeys.adminForms.all, "list"] as const,
    history: (key: string) => [...queryKeys.adminForms.all, "history", key] as const,
  },
  /** Official-directory sync runs (lib/api/school-sync.ts). */
  schoolSync: {
    all: ["school-sync"] as const,
    runs: (page: number) => [...queryKeys.schoolSync.all, "runs", page] as const,
    run: (id: string) => [...queryKeys.schoolSync.all, "run", id] as const,
    review: (id: string) => [...queryKeys.schoolSync.all, "review", id] as const,
    categories: (id: string) => [...queryKeys.schoolSync.all, "categories", id] as const,
    items: (id: string, filters: object) => [...queryKeys.schoolSync.all, "items", id, filters] as const,
    changes: (id: string, filters: object) => [...queryKeys.schoolSync.all, "changes", id, filters] as const,
  },
  /** Account administration added with the school and role work (lib/api/accounts.ts). */
  accounts: {
    all: ["accounts"] as const,
    affiliations: (filters: object) => [...queryKeys.accounts.all, "affiliations", filters] as const,
    candidates: (id: string) => [...queryKeys.accounts.all, "candidates", id] as const,
    teacherSchools: (teacherId: string) => [...queryKeys.accounts.all, "teacher-schools", teacherId] as const,
    delegations: (teacherId: string) => [...queryKeys.accounts.all, "delegations", teacherId] as const,
    teacherStudents: (filters: object) => [...queryKeys.accounts.all, "teacher-students", filters] as const,
    schoolAccess: (schoolId: string) => [...queryKeys.accounts.all, "school-access", schoolId] as const,
    schoolAccessStudents: (schoolId: string, filters: object) => [...queryKeys.accounts.all, "school-access", schoolId, "students", filters] as const,
    programmeHeads: (programmeId: string) => [...queryKeys.accounts.all, "programme-heads", programmeId] as const,
  },
  support: ["support"] as const,
  /** Teacher portal: students of the teacher's assigned schools. */
  teacher: {
    all: ["teacher"] as const,
    students: (filters: Record<string, unknown> = {}) => [...queryKeys.teacher.all, "students", filters] as const,
    summary: () => [...queryKeys.teacher.all, "summary"] as const,
    schools: () => [...queryKeys.teacher.all, "schools"] as const,
    profile: (studentId: string) => [...queryKeys.teacher.all, "profile", studentId] as const,
    progress: (studentId: string) => [...queryKeys.teacher.all, "progress", studentId] as const,
  },
  /** Programmes (Head Coach monitoring). */
  programmes: {
    all: ["programmes"] as const,
    list: () => [...queryKeys.programmes.all, "list"] as const,
    members: (programmeId: string, filters: Record<string, unknown> = {}) => [...queryKeys.programmes.all, "members", programmeId, filters] as const,
    /** Programme-scoped monitoring (dashboard, participation, activity, analytics) of the signed-in Head Coach. */
    dashboard: () => [...queryKeys.programmes.all, "dashboard"] as const,
    participation: () => [...queryKeys.programmes.all, "participation"] as const,
    activity: (filters: Record<string, unknown> = {}) => [...queryKeys.programmes.all, "activity", filters] as const,
    activitySummary: () => [...queryKeys.programmes.all, "activity-summary"] as const,
    analytics: (courseId: string, divisionId: string) => [...queryKeys.programmes.all, "analytics", courseId, divisionId] as const,
    /** Coach course × division assignments the caller may manage. */
    coachAccess: (filters: Record<string, unknown> = {}) => [...queryKeys.programmes.all, "coach-access", filters] as const,
    peopleSearch: (filters: Record<string, unknown> = {}) => [...queryKeys.programmes.all, "people", filters] as const,
    studentCandidates: (programmeId: string, q: string) => [...queryKeys.programmes.all, "candidates", programmeId, q] as const,
  },
  /** Test Management (lib/api/tests.ts): tests, their detail, subjects and marker authorisations. */
  tests: {
    all: ["tests"] as const,
    subjects: () => [...queryKeys.tests.all, "subjects"] as const,
    list: (filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.tests.all, "detail", id] as const,
    markers: (filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "markers", filters] as const,
    candidates: (subjectId: string, q: string) => [...queryKeys.tests.all, "candidates", subjectId, q] as const,
    // Phase 2 (lib/api/test-submissions.ts)
    mine: (filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "mine", filters] as const,
    teacher: (filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "teacher", filters] as const,
    teacherStudents: (testId: string, filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "teacher-students", testId, filters] as const,
    answer: (testId: string, studentId: string | null) => [...queryKeys.tests.all, "answer", testId, studentId ?? "me"] as const,
    tracking: (testId: string, filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "tracking", testId, filters] as const,
    submission: (testId: string, submissionId: string) => [...queryKeys.tests.all, "submission", testId, submissionId] as const,
    extensions: (testId: string, filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "extensions", testId, filters] as const,
    extensionTargets: (testId: string, kind: string, q: string) => [...queryKeys.tests.all, "extension-targets", testId, kind, q] as const,
    // Phase 3 (lib/api/test-marking.ts)
    marking: (testId: string) => [...queryKeys.tests.all, "marking", testId] as const,
    review: (testId: string, filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "marking", testId, "review", filters] as const,
    reviewDetail: (testId: string, submissionId: string) => [...queryKeys.tests.all, "marking", testId, "detail", submissionId] as const,
    markingHistory: (testId: string, filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "marking", testId, "history", filters] as const,
    queue: (filters: Record<string, unknown> = {}) => [...queryKeys.tests.all, "queue", filters] as const,
    toMark: (code: string) => [...queryKeys.tests.all, "to-mark", code] as const,
  },
  /** Backend-wide information (`GET /api/v1`), the same for every user. */
  backend: {
    all: ["backend"] as const,
    capabilities: () => [...queryKeys.backend.all, "capabilities"] as const,
  },

  courses: {
    all: ["courses"] as const,
    list: () => [...queryKeys.courses.all, "list"] as const,
    mine: () => [...queryKeys.courses.all, "mine"] as const,
    detail: (courseId: string) => [...queryKeys.courses.all, "detail", courseId] as const,
    resources: (courseId: string, filters: ResourceFilters = {}) =>
      [...queryKeys.courses.all, "resources", courseId, filters] as const,
  },

  assignments: {
    all: ["assignments"] as const,
    mine: (filters: MyAssignmentFilters = {}) => [...queryKeys.assignments.all, "mine", filters] as const,
    detail: (assignmentId: string) => [...queryKeys.assignments.all, "detail", assignmentId] as const,
  },

  submissions: {
    all: ["submissions"] as const,
    detail: (submissionId: string) => [...queryKeys.submissions.all, "detail", submissionId] as const,
    history: (submissionId: string) => [...queryKeys.submissions.all, "history", submissionId] as const,
  },

  results: {
    all: ["results"] as const,
    mine: (filters: MyResultFilters = {}) => [...queryKeys.results.all, "mine", filters] as const,
    detail: (submissionId: string) => [...queryKeys.results.all, "detail", submissionId] as const,
  },

  leaderboard: {
    all: ["leaderboard"] as const,
    students: (params: { page?: number; limit?: number } = {}) => [...queryKeys.leaderboard.all, "students", params] as const,
    schools: (params: { page?: number; limit?: number } = {}) => [...queryKeys.leaderboard.all, "schools", params] as const,
    me: () => [...queryKeys.leaderboard.all, "me"] as const,
  },

  discussions: {
    all: ["discussions"] as const,
    threads: (scope: ThreadScope) => [...queryKeys.discussions.all, "threads", scope] as const,
    thread: (threadId: string) => [...queryKeys.discussions.all, "thread", threadId] as const,
    comments: (threadId: string) => [...queryKeys.discussions.all, "comments", threadId] as const,
    replies: (commentId: string) => [...queryKeys.discussions.all, "replies", commentId] as const,
  },

  /** The caller's inbox. Read-state mutations invalidate `notifications.all` (lists and the badge). */
  notifications: {
    all: ["notifications"] as const,
    list: (params: NotificationFilters = {}) => [...queryKeys.notifications.all, "list", params] as const,
    unreadCount: () => [...queryKeys.notifications.all, "unread-count"] as const,
    preferences: () => ["notification-preferences"] as const,
    settings: () => ["notification-settings"] as const,
  },

  mentor: {
    all: ["mentor"] as const,
    scopes: () => [...queryKeys.mentor.all, "scopes"] as const,
    analyticsAll: ["mentor", "analytics"] as const,
    analytics: (courseId: string, divisionId: string) => [...queryKeys.mentor.analyticsAll, courseId, divisionId] as const,
    assignmentsAll: ["mentor", "assignments"] as const,
    assignments: (filters: AssignmentFilters = {}) => [...queryKeys.mentor.assignmentsAll, "list", filters] as const,
    assignment: (id: string) => [...queryKeys.mentor.assignmentsAll, "detail", id] as const,
    assignmentHistory: (id: string) => [...queryKeys.mentor.assignmentsAll, "history", id] as const,
    reviewsAll: ["mentor", "reviews"] as const,
    reviews: (filters: ReviewFilters = {}) => [...queryKeys.mentor.reviewsAll, "queue", filters] as const,
    review: (submissionId: string) => [...queryKeys.mentor.reviewsAll, "submission", submissionId] as const,
    reviewCycles: (submissionId: string) => [...queryKeys.mentor.reviewsAll, "cycles", submissionId] as const,
    resourcesAll: ["mentor", "resources"] as const,
    resources: (courseId: string, divisionId: string) => [...queryKeys.mentor.resourcesAll, "list", courseId, divisionId] as const,
    resource: (courseId: string, resourceId: string) => [...queryKeys.mentor.resourcesAll, "detail", courseId, resourceId] as const,
  },

  /**
   * Administrator data. Most admin actions change several views (dashboard
   * counts, queues, reports), so mutations usually invalidate `admin.all`.
   */
  admin: {
    all: ["admin"] as const,
    dashboard: (filters: ReportFilters = {}) => [...queryKeys.admin.all, "dashboard", filters] as const,
    overview: () => [...queryKeys.admin.all, "overview"] as const,
    auditAll: ["admin", "audit"] as const,
    audit: (filters: AuditFilters = {}) => [...queryKeys.admin.auditAll, "list", filters] as const,
    auditEntry: (id: string) => [...queryKeys.admin.auditAll, "entry", id] as const,
    auditActions: () => [...queryKeys.admin.auditAll, "actions"] as const,
    usersAll: ["admin", "users"] as const,
    users: (filters: UserFilters = {}) => [...queryKeys.admin.usersAll, "list", filters] as const,
    user: (id: string) => [...queryKeys.admin.usersAll, "detail", id] as const,
    /** GET /admin/users/:id/status-history (lib/accounts/status-history.ts). */
    userStatusHistory: (id: string, page: number) => [...queryKeys.admin.usersAll, "status-history", id, page] as const,
    divisions: () => [...queryKeys.admin.all, "divisions"] as const,
    schools: (params: { search?: string; page?: number; limit?: number } = {}) => [...queryKeys.admin.all, "schools", "list", params] as const,
    school: (id: string, page = 1) => [...queryKeys.admin.all, "schools", "detail", id, page] as const,
    studentReport: (filters: UserReportFilters = {}) => [...queryKeys.admin.all, "students", "report", filters] as const,
    participation: (filters: ReportFilters = {}) => [...queryKeys.admin.all, "courses", "participation", filters] as const,
    activeScopes: () => [...queryKeys.admin.all, "mentors", "scopes", "all-active"] as const,
    assignmentsAll: ["admin", "assignments"] as const,
    assignments: (filters: AdminAssignmentFilters = {}) => [...queryKeys.admin.assignmentsAll, "list", filters] as const,
    assignmentReport: (filters: Record<string, unknown> = {}) => [...queryKeys.admin.assignmentsAll, "report", filters] as const,
    assignment: (id: string) => [...queryKeys.admin.assignmentsAll, "detail", id] as const,
    assignmentHistory: (id: string) => [...queryKeys.admin.assignmentsAll, "history", id] as const,
    submissionsAll: ["admin", "submissions"] as const,
    submissions: (filters: AdminSubmissionFilters = {}) => [...queryKeys.admin.submissionsAll, "list", filters] as const,
    submission: (id: string) => [...queryKeys.admin.submissionsAll, "detail", id] as const,
    submissionCycles: (id: string) => [...queryKeys.admin.submissionsAll, "cycles", id] as const,
    resultHistory: (id: string) => [...queryKeys.admin.submissionsAll, "result-history", id] as const,
    resultsReport: (filters: Record<string, unknown> = {}) => [...queryKeys.admin.all, "results", "report", filters] as const,
    releases: (assignmentId: string) => [...queryKeys.admin.assignmentsAll, "releases", assignmentId] as const,
    batches: (assignmentId: string) => [...queryKeys.admin.assignmentsAll, "batches", assignmentId] as const,
    scopeMentors: (courseId: string, divisionId: string) => [...queryKeys.admin.all, "mentors", "scope", courseId, divisionId] as const,
    reviewsReport: (filters: Record<string, unknown> = {}) => [...queryKeys.admin.all, "reports", "reviews", filters] as const,
    contactMessages: (params: Record<string, unknown> = {}) => [...queryKeys.admin.all, "contact-messages", params] as const,
    moderationAll: ["admin", "moderation"] as const,
    moderationReports: (params: Record<string, unknown> = {}) => [...queryKeys.admin.moderationAll, "reports", params] as const,
    moderationReport: (id: string) => [...queryKeys.admin.moderationAll, "report", id] as const,
    moderationActions: (page = 1) => [...queryKeys.admin.moderationAll, "actions", page] as const,
    hiddenComments: (page = 1) => [...queryKeys.admin.moderationAll, "hidden", page] as const,
    settings: () => [...queryKeys.admin.all, "settings"] as const,
    mentorReport: (filters: UserReportFilters = {}) => [...queryKeys.admin.all, "mentors", "report", filters] as const,
    mentorScopes: (mentorId: string) => [...queryKeys.admin.all, "mentors", "scopes", mentorId] as const,
    mentorRequests: (params: { status?: string; page?: number } = {}) => [...queryKeys.admin.all, "mentor-requests", params] as const,
    /** Bulk e-mail (lib/api/admin-ops.ts, `/admin/email`). */
    emailAll: ["admin", "email"] as const,
    emailUsers: (filters: object) => [...queryKeys.admin.emailAll, "users", filters] as const,
    emailJobs: (params: object) => [...queryKeys.admin.emailAll, "jobs", params] as const,
    emailJob: (id: string) => [...queryKeys.admin.emailAll, "job", id] as const,
    emailDeliveries: (id: string, params: object) => [...queryKeys.admin.emailAll, "deliveries", id, params] as const,
    /** Learning-activity log (`/admin/activity`). */
    activity: (filters: object) => [...queryKeys.admin.all, "activity", "list", filters] as const,
    activitySummary: (range: object) => [...queryKeys.admin.all, "activity", "summary", range] as const,
    /** Permission overrides and effective permissions of one user. */
    permissionsOf: (userId: string) => [...queryKeys.admin.all, "permissions", userId] as const,
    overrides: (userId: string) => [...queryKeys.admin.permissionsOf(userId), "overrides"] as const,
    effectivePermissions: (userId: string) => [...queryKeys.admin.permissionsOf(userId), "effective"] as const,
    permissionCatalogue: () => [...queryKeys.admin.all, "permission-catalogue"] as const,
  },
};
