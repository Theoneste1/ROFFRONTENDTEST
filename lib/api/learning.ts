/** Courses and learning resources. */
import { api, apiBlob, type QueryValue } from "./client";
import type { Course, CourseCompletion, CourseResource, MyCourse, ResourceType } from "./types";

export interface ResourceFilters {
  type?: ResourceType;
  q?: string;
  tag?: string;
  year?: number;
  /** Staff only. Students always get their own division. */
  divisionId?: string;
  [key: string]: QueryValue;
}

export const coursesApi = {
  /** The four courses (students: published ones, with their progress). */
  list: () => api<Course[]>("/courses"),
  get: (courseId: string) => api<Course>(`/courses/${courseId}`),
  /** Student: progress in each course of their division. */
  mine: () => api<MyCourse[]>("/me/courses"),
  /** Student: mark a course as completed. */
  complete: (courseId: string) => api<CourseCompletion>(`/courses/${courseId}/complete`, { method: "POST" }),

  resources: (courseId: string, filters: ResourceFilters = {}) =>
    api<CourseResource[]>(`/courses/${courseId}/resources`, { query: filters }),
  resource: (courseId: string, resourceId: string) => api<CourseResource>(`/courses/${courseId}/resources/${resourceId}`),
  resourceFile: (courseId: string, resourceId: string, attachmentId: string, name?: string) =>
    apiBlob(`/courses/${courseId}/resources/${resourceId}/attachments/${attachmentId}/file`, {}, name),
};
