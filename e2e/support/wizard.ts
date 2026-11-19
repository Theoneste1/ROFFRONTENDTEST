/**
 * The registration forms show one step at a time (app/components/forms/FormWizard): move to the next step the way a
 * person does (the "Next" button) and wait until it is shown.
 */
import { expect, type Page } from "@playwright/test";

/** Click "Next" and wait for the step with this title ("Step 2 of 5 · Your studies"). */
export async function nextStep(page: Page, title: string) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByTestId("wizard-progress")).toContainText(title);
}

/** The step shown now: its number and title ("Step 2 of 5 · Your studies"). */
export function progress(page: Page) {
  return page.getByTestId("wizard-progress");
}
