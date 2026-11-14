import type { Metadata } from "next";
import ProgrammesAdmin from "./ProgrammesAdmin";

export const metadata: Metadata = { title: "Programmes" };

/** Programme membership (programmes.manageMembers). */
export default function ProgrammesPage() {
  return <ProgrammesAdmin />;
}
