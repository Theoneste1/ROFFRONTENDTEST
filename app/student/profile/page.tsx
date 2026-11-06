import type { Metadata } from "next";
import ProfilePage from "@/app/components/account/ProfilePage";

export const metadata: Metadata = { title: "My profile" };

/** The signed-in user's profile, password and notification preferences. */
export default function Page() {
  return <ProfilePage />;
}
