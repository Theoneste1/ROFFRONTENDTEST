"use client";

import { PASSWORD_RULE } from "@/lib/api/auth";
import { PasswordField } from "@/app/components/ui/form";

/** Password + confirmation, validated with the backend's password policy. */
export function validateNewPassword(password: string, confirm: string): { password?: string; confirm?: string } {
  const errors: { password?: string; confirm?: string } = {};
  if (!PASSWORD_RULE.test(password)) errors.password = PASSWORD_RULE.hint;
  if (confirm !== password) errors.confirm = "The passwords don't match.";
  return errors;
}

export default function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  errors,
  label = "New password",
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  errors: { password?: string; confirm?: string };
  label?: string;
}) {
  return (
    <>
      <PasswordField
        label={label}
        name="new-password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_RULE.max}
        value={password}
        onChange={(e) => onPassword(e.target.value)}
        error={errors.password}
        hint={PASSWORD_RULE.hint}
      />
      <PasswordField
        label="Confirm password"
        name="confirm-password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_RULE.max}
        value={confirm}
        onChange={(e) => onConfirm(e.target.value)}
        error={errors.confirm}
      />
    </>
  );
}
