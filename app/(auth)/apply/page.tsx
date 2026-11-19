import type { Metadata } from "next";
import { SignupCard } from "@/app/components/auth/AuthCard";
import ApplyForm from "./ApplyForm";

export const metadata: Metadata = { title: "Join as a coach" };

/**
 * Coach application (existing backend flow: POST /mentor-requests); `?as=teacher` shows how teachers join.
 * The query is read here on the server and passed down (no client useSearchParams and Suspense boundary), so the form is
 * server-rendered once and hydrated — never rendered a second time on the client next to the streamed copy.
 */
export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  const { as } = await searchParams;
  return (
    <SignupCard brand={as === "teacher" ? "teacher" : "coach"}>
      <div data-signup className="contents">
        <ApplyForm teacher={as === "teacher"} />
      </div>
    </SignupCard>
  );
}
