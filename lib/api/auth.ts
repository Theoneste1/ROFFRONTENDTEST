/** Auth and current-user endpoints. */
import { api, setAccessToken } from "./client";
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

export const authApi = {
  /** `username` may also be the e-mail address. */
  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await api<LoginResponse>("/auth/login", {
      method: "POST",
      body: { username: username.trim(), password },
      auth: false,
    });
    setAccessToken(res.access_token);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await api<MessageResponse>("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
    }
  },

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
};

export interface RegisterStudentInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  gradeLevel: GradeLevel;
  schoolName: string;
  schoolLocation: string;
  /** Student's home district or city (required, 2–200 characters). */
  homeLocation: string;
}

/** `POST /auth/register/student` response (the created profile plus what happens next). */
export interface RegisterStudentResult {
  id: string;
  username: string;
  requiresApproval: boolean;
  requiresEmailVerification: boolean;
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
  /** School name suggestions (at least 2 characters; up to 10 results). */
  searchSchools: (q: string) => api<{ id: string; name: string; location: string }[]>("/schools/search", { query: { q }, auth: false }),
};

/** Backend password policy (src/auth/dto/password.rules.ts). */
export const PASSWORD_RULE = {
  min: 8,
  max: 100,
  hint: "At least 8 characters, with at least one letter and one number.",
  test: (p: string) => p.length >= 8 && p.length <= 100 && /[a-zA-Z]/.test(p) && /[0-9]/.test(p),
};
