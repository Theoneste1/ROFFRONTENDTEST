"use client";

/**
 * A teacher's course homework for their students (owner 2026-11-24, capability teacherHomeworkDefault): on by default for
 * every teacher — they see the homework progress of the students of their schools and the students assigned to them, and
 * hand homework in for them (each hand-in is recorded as done by the teacher). An Administrator (users.manageTeachers)
 * turns both off — with a reason, audited — or back on, in one switch. The account itself is untouched.
 *
 *   GET /admin/teachers/:id/homework-submission   { allowed, revokedAt, reason, revokedBy }
 *   PUT /admin/teachers/:id/homework-submission   { allowed: false, reason } | { allowed: true }
 */
import { teachersAdminApi } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query/keys";
import TeacherDefaultSwitchCard from "./TeacherDefaultSwitchCard";

export default function TeacherHomeworkSubmissionCard({ teacherId }: { teacherId: string }) {
  return (
    <TeacherDefaultSwitchCard
      queryKey={queryKeys.accounts.teacherHomeworkSubmission(teacherId)}
      load={() => teachersAdminApi.homeworkSubmission(teacherId)}
      save={(body) => teachersAdminApi.setHomeworkSubmission(teacherId, body)}
      text={{
        id: "teacher-homework-submission",
        title: "Course homework",
        intro: "Hands in course homework for their students — on by default. The teacher sees the homework of the students of their schools and the students assigned to them, and hands it in for them. Turning it off does not deactivate the account.",
        turnOff: "Turn off course homework",
        turnOn: "Turn course homework back on",
        placeholder: "For example: handed in homework for the wrong class",
      }}
    />
  );
}
