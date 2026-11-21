import type { CurrentUser } from "@/lib/api/types";

/**
 * First-sign-in date of birth (owner decision 9.3): a student created by an Administrator, invited or imported may
 * have none. Until they give it the backend refuses every other request (403 DATE_OF_BIRTH_REQUIRED), so the student
 * portal shows only the date-of-birth step. Older backends never send the flag: nobody is held.
 */
export function needsDateOfBirth(user: Pick<CurrentUser, "role" | "dateOfBirthRequired"> | null | undefined): boolean {
  return user?.role === "STUDENT" && user.dateOfBirthRequired === true;
}

/** The API refused a request because the student has not given their date of birth yet. */
export const DATE_OF_BIRTH_REQUIRED = "DATE_OF_BIRTH_REQUIRED";
