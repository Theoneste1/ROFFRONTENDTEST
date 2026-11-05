import type { Metadata } from "next";
import UserDetail from "./UserDetail";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  return <UserDetail userId={id} />;
}
