/**
 * The user guide on a phone: the contents are folded under "Contents" so the guide itself starts on screen, a section
 * link from the folded contents works, and the page never scrolls sideways.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";

test("phone: contents folded, the first section on screen, no sideways scrolling", async ({ page }) => {
  await signIn(page, "student");
  await page.goto("/student/guide");
  await expect(page.getByTestId("user-guide-title")).toBeVisible();
  await expect(page.getByTestId("user-guide-contents")).toBeHidden();
  const folded = page.getByTestId("user-guide-contents-phone");
  await expect(folded).toBeVisible();
  await expect(folded).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await folded.locator("summary").click();
  await folded.getByRole("link", { name: "Leaderboard" }).click();
  await expect(page).toHaveURL(/\/student\/guide#student-leaderboard$/);
  await expect(page.locator("#student-leaderboard")).toBeInViewport();
});
