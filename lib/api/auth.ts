/** Auth and current-user endpoints. */
import { api, setAccessToken } from "./client";
import type {
  ActivateResponse,
  ActivationInfo,
  CurrentUser,
  LoginResponse,
  MePermissions,
  MessageResponse,
  SupportInfo,
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
  permissions: () => api<MePermissions>("/me/permissions"),
};

export const publicApi = {
  support: () => api<SupportInfo>("/support", { auth: false }),
};

/** Backend password policy (src/auth/dto/password.rules.ts). */
export const PASSWORD_RULE = {
  min: 8,
  max: 100,
  hint: "At least 8 characters, with at least one letter and one number.",
  test: (p: string) => p.length >= 8 && p.length <= 100 && /[a-zA-Z]/.test(p) && /[0-9]/.test(p),
};
