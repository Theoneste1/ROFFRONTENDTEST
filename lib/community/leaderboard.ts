/**
 * Leaderboard display rules shared by the leaderboard page and the student dashboard.
 */
import { isApiError } from "@/lib/api/errors";

/** "#3", or "Not ranked yet" when the backend has no rank for the student (rank: null). */
export function rankLabel(rank: number | null | undefined): string {
  return typeof rank === "number" ? `#${rank}` : "Not ranked yet";
}

/** The administrators turned the student leaderboard off (403 LEADERBOARD_HIDDEN): say so instead of an error. */
export function leaderboardHidden(error: unknown): boolean {
  return isApiError(error) && error.code === "LEADERBOARD_HIDDEN";
}

export const HIDDEN_TITLE = "The leaderboard is hidden";
export const HIDDEN_TEXT = "The administrators have turned the leaderboard off for now. Your points still count.";
