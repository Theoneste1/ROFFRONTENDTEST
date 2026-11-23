"use client";

/**
 * A teacher's test submission for their students (owner 2026-11-21, capability testSubmissionLock): on by default for
 * every teacher. An Administrator (users.manageTeachers) turns it off — with a reason, audited — or back on, in one
 * switch. The account itself is untouched: the teacher still signs in and still sees their students.
 *
 *   GET /admin/teachers/:id/test-submission   { allowed, revokedAt, reason, revokedBy }
 *   PUT /admin/teachers/:id/test-submission   { allowed: false, reason } | { allowed: true }
 */
import { teachersAdminApi } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query/keys";
import TeacherDefaultSwitchCard from "./TeacherDefaultSwitchCard";

export default function TeacherTestSubmissionCard({ teacherId }: { teacherId: string }) {
  return (
    <TeacherDefaultSwitchCard
      queryKey={queryKeys.accounts.teacherTestSubmission(teacherId)}
      load={() => teachersAdminApi.testSubmission(teacherId)}
      save={(body) => teachersAdminApi.setTestSubmission(teacherId, body)}
      text={{
        id: "teacher-test-submission",
        title: "Test submission for students",
        intro: "On by default: the teacher can submit tests for the students of their school. Turning it off does not deactivate the account.",
        turnOff: "Turn off test submission",
        turnOn: "Turn test submission back on",
        placeholder: "For example: submitted for students of another school",
      }}
    />
  );
}
