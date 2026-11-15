import type { Metadata } from "next";
import AccountSettingsPage from "@/app/components/account/AccountSettingsPage";

export const metadata: Metadata = { title: "Settings" };

/** The signed-in user's own settings: sign-in details, password, sessions, notification e-mails. */
export default function Page() {
  return <AccountSettingsPage />;
}
