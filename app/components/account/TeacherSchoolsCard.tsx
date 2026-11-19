"use client";

/**
 * A Teacher's own schools on their profile (backends with primaryTeacher, GET /teacher/schools): each school and whether
 * they are its primary teacher — the school's main contact — or a secondary teacher. The same rights either way
 * (owner decision 2026-11-19). Schools are assigned by the administrators.
 */
import { useQuery } from "@tanstack/react-query";
import { School } from "lucide-react";
import { teacherApi } from "@/lib/api/teacher";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { primaryTeacherSupported } from "@/lib/schools/primary-teacher";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { errorMessage } from "@/lib/api/errors";
import TeacherRoleBadge from "@/app/components/teachers/TeacherRoleBadge";
import { Section } from "./Section";

export default function TeacherSchoolsCard() {
  const on = primaryTeacherSupported(useBackendCapabilities().detection);
  const schools = useQuery({ queryKey: queryKeys.teacher.schools(), queryFn: teacherApi.schools, enabled: on });
  if (!on) return null;
  return (
    <Section
      title="My schools"
      icon={<School className="w-5 h-5" />}
      description="The primary teacher is the school's main contact. Primary and secondary teachers have the same rights. Schools are assigned by the administrators."
    >
      <div data-testid="teacher-own-schools">
        {schools.isPending ? (
          <LoadingBlock />
        ) : schools.isError ? (
          <Alert tone="error">{errorMessage(schools.error)}</Alert>
        ) : schools.data.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No school is assigned to you yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {schools.data.map((s) => (
              <li key={s.assignmentId} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-800">{s.school.name}</span>
                  <span className="block text-xs text-gray-500">{[s.school.code, s.school.district, s.school.sector].filter(Boolean).join(" · ") || s.school.location}</span>
                </span>
                <TeacherRoleBadge role={s.role} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
