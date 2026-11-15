/** Auth and current-user endpoints. */
import { api, apiBlob, setAccessToken } from "./client";
import type { OlympiadSubject } from "./teacher-registration";
import { isApiError } from "./errors";
import type {
  ActivateResponse,
  ActivationInfo,
  CurrentUser,
  GradeLevel,
  LoginResponse,
  MePermissions,
  MessageResponse,
  SupportInfo,
  UpdateMeInput,
} from "./types";

/**
 * Sign-in after a sleeping backend: Netlify's proxy answers 502/504 (or the request fails) while
 * Render starts (~30 s). Those answers mean the request never reached a running server, so it is
 * retried a few times with a short wait; any real answer (401, 403, 429, …) is returned at once.
 */
export const LOGIN_RETRY_DELAYS_MS = [3_000, 6_000, 10_000] as const;
export function isGatewayFailure(e: unknown): boolean {
  return isApiError(e) && (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504);
}

export const authApi = {
  /** `username` may also be the e-mail address. */
  async login(username: string, password: string, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<LoginResponse> {
    const attempt = () => api<LoginResponse>("/auth/login", {
      method: "POST",
      body: { username: username.trim(), password },
      auth: false,
    });
    let res: LoginResponse | undefined;
    for (let i = 0; ; i++) {
      try {
        res = await attempt();
        break;
      } catch (e) {
        if (!isGatewayFailure(e) || i >= LOGIN_RETRY_DELAYS_MS.length) throw e;
        await wait(LOGIN_RETRY_DELAYS_MS[i]);
      }
    }
    setAccessToken(res.access_token);
    return res;
  },

  /**
   * End this session on the server. The refresh cookie identifies it, so this
   * works after the access token has expired (H1): never refresh first (that
   * would only rotate the session about to be revoked). A bearer token, if one
   * is in memory, is sent so the server blacklists it too.
   */
  async logout(): Promise<void> {
    try {
      await api<MessageResponse>("/auth/logout", { method: "POST", refresh: false });
    } finally {
      setAccessToken(null);
    }
  },

  /** Needs a valid access token: on 401 the client refreshes once and retries (M1). */
  async logoutAll(): Promise<void> {
    try {
      await api<MessageResponse>("/auth/logout-all", { method: "POST" });
    } finally {
      setAccessToken(null);
    }
  },

  forgotPassword: (email: string) =>
    api<MessageResponse>("/auth/forgot-password", { method: "POST", body: { email: email.trim() }, auth: false }),

  resetPassword: (token: string, newPassword: string) =>
    api<MessageResponse>("/auth/reset-password", { method: "POST", body: { token, newPassword }, auth: false }),

  /** Ends every other session; the user must sign in again afterwards. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api<MessageResponse>("/auth/password", { method: "PATCH", body: { currentPassword, newPassword } }),

  inspectActivation: (token: string) =>
    api<ActivationInfo>("/auth/activation/inspect", { method: "POST", body: { token }, auth: false }),

  activate: (token: string, password?: string) =>
    api<ActivateResponse>("/auth/activate", {
      method: "POST",
      body: password ? { token, password } : { token },
      auth: false,
    }),

  resendActivation: (email: string) =>
    api<MessageResponse>("/auth/resend-activation", { method: "POST", body: { email: email.trim() }, auth: false }),
};

export const meApi = {
  get: () => api<CurrentUser>("/me"),
  /** Only firstName, lastName and homeLocation can be changed. */
  update: (input: UpdateMeInput) => api<CurrentUser>("/me", { method: "PATCH", body: input }),
  permissions: () => api<MePermissions>("/me/permissions"),
  /** `PUT /me/avatar` (capability `profilePictures`): the new picture; returns the profile. Upload progress is tracked by the client. */
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<CurrentUser>("/me/avatar", { method: "PUT", body: form });
  },
  /** `DELETE /me/avatar`: back to the generated avatar; returns the profile. */
  removeAvatar: () => api<CurrentUser>("/me/avatar", { method: "DELETE" }),
  /** A picture behind authentication (`/users/:id/avatar?v=…`), as a blob (the token is never put in a URL). */
  avatarImage: (path: string) => apiBlob(path, {}, "avatar"),
};

/**
 * `POST /auth/register/student`. Every backend accepts the legacy school fields
 * (`schoolName` + `schoolLocation`). A backend advertising `schoolAffiliations`
 * also accepts exactly one of the school-claim shapes instead (lib/accounts/school-claim):
 * `schoolCode`; `schoolName` + province / district / sector; or `country` + `schoolName`.
 * Unknown fields are refused (400), so the new shapes go only to that backend.
 */
export interface RegisterStudentInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  gradeLevel: GradeLevel;
  schoolName?: string;
  schoolLocation?: string;
  schoolCode?: string;
  schoolProvince?: string;
  schoolDistrict?: string;
  schoolSector?: string;
  country?: string;
  /** Student's home district or city (required, 2–200 characters). */
  homeLocation: string;
  /** Olympiad interests (only on a backend with `studentOlympiadInterests`; the form requires one). */
  olympiadInterests?: OlympiadSubject[];
}

/** `POST /auth/register/student` response (the created profile plus what happens next). */
export interface RegisterStudentResult {
  id: string;
  username: string;
  requiresApproval: boolean;
  requiresEmailVerification: boolean;
  /** New backend: "PENDING" while an administrator verifies the school (absent on older backends). */
  schoolVerification?: "PENDING" | null;
}

export interface MentorApplicationInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

/** `GET /public/statistics`: aggregate counts of active members (teachers: null — not on the platform yet). */
export interface PublicStatistics {
  students: number;
  coaches: number;
  teachers: number | null;
  schools: number;
  members: number;
  generatedAt: string;
}

export interface ContactInput {
  fullName: string;
  email: string;
  subject: string;
  message: string;
  /** Honeypot: always empty for people. */
  website?: string;
}

/** `POST /public/contact`: the message is stored; `notification` says whether an e-mail notice was queued to ROF support. */
export interface ContactResult {
  received: true;
  id?: string;
  notification: "QUEUED" | "NOT_CONFIGURED";
}

export const publicApi = {
  support: () => api<SupportInfo>("/support", { auth: false }),
  statistics: () => api<PublicStatistics>("/public/statistics", { auth: false }),
  contact: (input: ContactInput) => api<ContactResult>("/public/contact", { method: "POST", body: input, auth: false }),
  /** Student self-registration (may be closed by the administrators: 403 REGISTRATION_CLOSED). */
  registerStudent: (input: RegisterStudentInput) => api<RegisterStudentResult>("/auth/register/student", { method: "POST", body: input, auth: false }),
  /** Teacher / coach application: a mentor request that an administrator approves or rejects. */
  applyAsMentor: (input: MentorApplicationInput) => api<{ id: string; status: string }>("/mentor-requests", { method: "POST", body: input, auth: false }),
};

/** Backend password policy (src/auth/dto/password.rules.ts). */
export const PASSWORD_RULE = {
  min: 8,
  max: 100,
  hint: "At least 8 characters, with at least one letter and one number.",
  test: (p: string) => p.length >= 8 && p.length <= 100 && /[a-zA-Z]/.test(p) && /[0-9]/.test(p),
};
