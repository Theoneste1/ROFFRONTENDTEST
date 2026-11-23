/**
 * A school without an official code, chosen at registration (capability schoolCodeAtRegistration, owner 2026-11-23): the
 * person registering must give its 6-digit code. The first digit is the province (1 Kigali City, 2 Southern, 3 Western,
 * 4 Northern, 5 Eastern). The backend checks again — that no other school has the code — and the first valid code
 * becomes the school's. Tested in tests/school-code.test.mjs.
 */
const PROVINCE_DIGIT: Readonly<Record<string, string>> = {
  "Kigali City": "1",
  "Southern Province": "2",
  "Western Province": "3",
  "Northern Province": "4",
  "Eastern Province": "5",
};

/** The 6 digits typed, spaces removed. */
export function cleanSchoolCode(typed: string): string {
  return typed.replace(/\s+/g, "");
}

/** What is wrong with a typed code for a school of this province, in plain words — or undefined when it can be sent. */
export function schoolCodeProblem(typed: string, province: string | null | undefined): string | undefined {
  const code = cleanSchoolCode(typed);
  if (!code) return "Your school has no code in our list yet: enter its 6-digit school code (the school's office has it).";
  if (!/^\d{6}$/.test(code)) return "A school code is exactly 6 digits.";
  const digit = province ? PROVINCE_DIGIT[province] : undefined;
  if (digit && code[0] !== digit) return `A school code in ${province} starts with ${digit}. Check the code with the school.`;
  return undefined;
}

/** The backend's answers about a typed code (all carry details.field = "newSchoolCode"): their messages are shown as given. */
export const SCHOOL_CODE_ERROR_CODES: readonly string[] = ["SCHOOL_CODE_REQUIRED", "INVALID_SCHOOL_CODE", "SCHOOL_CODE_TAKEN"];

/** True when an API error is about the typed code of a code-less school. */
export function isNewSchoolCodeError(err: { code?: string; details?: unknown } | null | undefined): boolean {
  return !!err && SCHOOL_CODE_ERROR_CODES.includes(err.code ?? "") && (err.details as { field?: string } | undefined)?.field === "newSchoolCode";
}
