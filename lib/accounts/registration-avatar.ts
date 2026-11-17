/**
 * Optional profile picture at registration (REG-02, agreed 2026-11-18: never mandatory) — capability
 * `registrationAvatar`. The form keeps the chosen file; after the registration / application succeeded, the answer's
 * one-time `avatarUploadToken` uploads it (PUT /auth/register/avatar). A failed upload never undoes or blocks the
 * registration: the person is told to add the picture later in My Profile. Pure rules + the API call; tested in
 * tests/registration-avatar.test.mjs.
 */
import { api } from "../api/client";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { avatarFileProblem, avatarUploadErrorText } from "./avatar";

export const registrationAvatarSupported = (d: BackendDetection | null | undefined) => hasFeature(d, "registrationAvatar");

/** The optional field's error ("" file = nothing chosen = fine). Same rules as My Profile. */
export const registrationAvatarProblem = (file: File | null) => (file ? avatarFileProblem(file) : null);

export type PictureOutcome = "none" | "saved" | "failed";

/** Uploads the chosen picture with the registration's token; never throws (registration already succeeded). */
export async function uploadRegistrationAvatar(token: string | null | undefined, file: File | null): Promise<{ outcome: PictureOutcome; message?: string }> {
  if (!file) return { outcome: "none" };
  if (!token) return { outcome: "failed", message: "Your picture could not be saved. You can add it later in My Profile." };
  try {
    const form = new FormData();
    form.append("token", token);
    form.append("file", file);
    await api<{ avatar: true }>("/auth/register/avatar", { method: "PUT", body: form, auth: false });
    return { outcome: "saved" };
  } catch (e) {
    const known = avatarUploadErrorText(e as { status?: number; code?: string });
    return { outcome: "failed", message: `${known ? `${known} ` : ""}Your picture was not saved — add it later in My Profile. Your registration is complete.` };
  }
}

/** One line for the confirmation screen. */
export function pictureOutcomeText(r: { outcome: PictureOutcome; message?: string } | null): string | null {
  if (!r || r.outcome === "none") return null;
  return r.outcome === "saved" ? "Your profile picture was added." : (r.message ?? "Your picture was not saved — add it later in My Profile.");
}
