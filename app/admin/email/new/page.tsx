import type { Metadata } from "next";
import ComposeEmailClient from "./ComposeEmailClient";

export const metadata: Metadata = { title: "New e-mail" };

export default function ComposeEmailPage() {
  return <ComposeEmailClient />;
}
