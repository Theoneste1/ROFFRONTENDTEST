"use client";

/**
 * A labelled plain dropdown for the teacher form's country and home place, built on the shared
 * CascadeSelect (app/components/schools/SchoolCascade.tsx) so every form uses one control.
 * Options may be plain strings (value = label).
 */
import type { ComponentProps } from "react";
import { CascadeSelect } from "@/app/components/schools/SchoolCascade";

export function PlaceSelect({
  options,
  ...props
}: Omit<ComponentProps<typeof CascadeSelect>, "options"> & { options: readonly (string | { value: string; label: string })[] }) {
  return <CascadeSelect {...props} options={options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))} />;
}
