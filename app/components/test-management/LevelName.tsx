"use client";

/** A division code (Olympiad level, or ALL / UNKNOWN) shown by its name from the divisions the backend lists. */
import { useDivisionLabel } from "@/lib/queries/divisions";

export default function LevelName({ code }: { code: string | null | undefined }) {
  const label = useDivisionLabel();
  return <>{code === "UNKNOWN" ? "Unknown grade" : label(code)}</>;
}
