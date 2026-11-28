/**
 * ROF's official support details (platform settings: platform.supportEmail, support.phone, support.hours) for a test:
 * set through the administrator API, and put back afterwards. The disposable test database only.
 */
import type { APIRequestContext } from "@playwright/test";
import { ACCOUNTS, passwordOf } from "./accounts";

const API = () => (process.env.E2E_API_URL ?? "http://127.0.0.1:4100").replace(/\/+$/, "");
export const SUPPORT_KEYS = ["platform.supportEmail", "support.phone", "support.hours"] as const;
export type SupportSettings = Partial<Record<(typeof SUPPORT_KEYS)[number], string | null>>;

async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API()}/api/v1/auth/login`, { data: { username: ACCOUNTS.admin.username, password: passwordOf("admin") } });
  if (!res.ok()) throw new Error(`administrator sign-in for the support settings failed: ${res.status()}`);
  const body = await res.json();
  return body.access_token ?? body.accessToken;
}

/** Sets the given support settings; returns a function that puts the previous values back. */
export async function setSupportSettings(request: APIRequestContext, values: SupportSettings): Promise<() => Promise<void>> {
  const headers = { authorization: `Bearer ${await adminToken(request)}` };
  const before = await (await request.get(`${API()}/api/v1/support`)).json();
  const previous: SupportSettings = { "platform.supportEmail": before.email ?? null, "support.phone": before.phone ?? null, "support.hours": before.hours ?? null };
  const res = await request.patch(`${API()}/api/v1/admin/settings`, { headers, data: values });
  if (!res.ok()) throw new Error(`setting the support details failed: ${res.status()} ${await res.text()}`);
  return async () => { await request.patch(`${API()}/api/v1/admin/settings`, { headers, data: previous }); };
}
