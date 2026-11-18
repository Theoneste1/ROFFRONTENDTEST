/** Synthetic accounts the browser tests use (created by global-setup.ts in the disposable test database). */
export const PASSWORD = "E2e-Pass-2026!";

export const ACCOUNTS = {
  admin: { username: "admin", role: "ADMIN" },
  superAdmin: { username: "e2e.super", role: "SUPER_ADMIN" },
  coach: { username: "e2e.coach", role: "MENTOR" },
  headCoach: { username: "e2e.head", role: "HEAD_COACH" },
  teacher: { username: "e2e.teacher", role: "TEACHER" },
  student: { username: "e2e.student", role: "STUDENT" },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

export const passwordOf = (key: AccountKey) => (key === "admin" ? process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!" : PASSWORD);
