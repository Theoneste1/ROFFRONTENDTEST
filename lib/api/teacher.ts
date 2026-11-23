/**
 * Teacher endpoints (`/teacher/students`, backend src/teachers/*). Every route
 * is limited by the backend to STUDENT accounts of the schools an
 * Administrator assigned to the teacher, and the students assigned to them
 * (any other student → 404).
 *
 * - list       students.viewScoped (Teacher default): name, username, grade, division, school
 * - profile    students.viewProfile (Administrator-granted): + account and enrolment status
 * - progress   students.viewProgress (Teacher default on backends with teacherHomeworkDefault,
 *              owner 2026-11-24; Administrator-granted before): assignments and submission
 *              history — never scores, feedback or reviews
 * - submit     submissions.submitOnBehalf (the same): the student stays the owner; the teacher
 *              is recorded as the submitter. An Administrator switches both off per teacher.
 *
 * Never returned: e-mail, phone, home location, grades, marks, feedback.
 */
import { api, type QueryValue } from "./client";
import type { AssignmentStatus, DivisionRef, GradeLevel, Page, Role, SubmissionStatus } from "./types";

export interface TeacherStudent {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  gradeLevel: GradeLevel | null;
  division: DivisionRef | null;
  school: { id: string; name: string; location: string } | null;
  /** Backends with teacherStudentAccess: how you see the student, and what your permissions let you do for them. */
  access?: { school: boolean; assigned: boolean };
  can?: { viewProfile: boolean; viewProgress: boolean; submitOnBehalf: boolean };
}

/** GET /teacher/students/summary (teacherStudentAccess). Pending students are a number only. */
export interface TeacherStudentsSummary { schools: number; students: number; viaSchool: number; viaAssignment: number; pendingVerification: number }

export interface TeacherStudentProfile extends TeacherStudent {
  account: { isActive: boolean; isApproved: boolean; activated: boolean; registeredAt: string; lastLoginAt: string | null };
  currentEnrolment: { status: string; gradeLevel: GradeLevel | null; academicYear: { id: string; name: string } } | null;
}

/** Who sent a submission attempt: the student, or a teacher on the student's behalf. */
export interface Submitter {
  id: string;
  username: string;
  role: Role;
}

export interface TeacherProgressAttempt {
  revisionNumber: number;
  submittedAt: string;
  isLate: boolean;
  submittedBy: Submitter;
  /** Number of attached files. */
  files: number;
}

export interface TeacherProgressAssignment {
  id: string;
  title: string;
  status: AssignmentStatus;
  deadline: string;
  allowResubmission: boolean;
  maxResubmissions: number;
  allowLateSubmission: boolean;
  course: { id: string; code: string; title: string };
  /** The student's submission: state and attempts only — never a score or feedback. */
  submission: {
    id: string;
    status: SubmissionStatus;
    isLate: boolean;
    submittedAt: string;
    revisionCount: number;
    attempts: TeacherProgressAttempt[];
  } | null;
}

export interface TeacherStudentProgress {
  student: { id: string; username: string };
  assignments: TeacherProgressAssignment[];
}

/** `POST /teacher/students/:id/submissions`: the submission's state, owned by the student, sent by the teacher. */
export interface OnBehalfSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  isLate: boolean;
  submittedAt: string;
  revisionCount: number;
  submittedBy: Submitter;
}

export interface TeacherStudentFilters {
  q?: string;
  gradeLevel?: GradeLevel;
  schoolId?: string;
  /** teacherStudentAccess: SCHOOL (verified students of your schools) or ASSIGNED (assigned to you). */
  access?: "SCHOOL" | "ASSIGNED";
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

/** GET /teacher/schools (primaryTeacher): your schools and whether you are the primary teacher (main contact). */
export interface TeacherOwnSchool {
  assignmentId: string;
  role: "PRIMARY" | "SECONDARY";
  since: string;
  school: { id: string; code: string | null; name: string; location: string; district: string | null; sector: string | null };
}

export const teacherApi = {
  schools: () => api<TeacherOwnSchool[]>("/teacher/schools"),
  students: (filters: TeacherStudentFilters = {}) => api<Page<TeacherStudent>>("/teacher/students", { query: filters }),
  summary: () => api<TeacherStudentsSummary>("/teacher/students/summary"),
  profile: (studentId: string) => api<TeacherStudentProfile>(`/teacher/students/${studentId}`),
  progress: (studentId: string) => api<TeacherStudentProgress>(`/teacher/students/${studentId}/progress`),
  /** Multipart, the same fields as a student's own submission (assignmentId, answerText, note, files). */
  submitOnBehalf: (studentId: string, input: { assignmentId: string; answerText?: string; note?: string; files?: File[] }) => {
    const form = new FormData();
    form.set("assignmentId", input.assignmentId);
    if (input.answerText?.trim()) form.set("answerText", input.answerText.trim());
    if (input.note?.trim()) form.set("note", input.note.trim());
    for (const f of input.files ?? []) form.append("files", f);
    return api<OnBehalfSubmission>(`/teacher/students/${studentId}/submissions`, { method: "POST", body: form });
  },
};
