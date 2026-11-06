import type { Metadata } from "next";
import SupportInfo from "./SupportInfo";

export const metadata: Metadata = { title: "Help and support" };

/** Public help page: the support contact details from `GET /support`. */
export default function SupportPage() {
  return <SupportInfo />;
}
