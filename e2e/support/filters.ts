/**
 * The list filter bar (owner 2026-11-25, app/components/ui/FilterBar.tsx): a search box, "+ Add filter" which lists the
 * filters not in use, and the active ones as chips (click to change, × to remove, "Clear all").
 * `scope` is the page, or the part of it holding the bar when a page has more than one.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** Adds a filter that is not in use: "+ Add filter", the filter, then its value (the option's exact label). */
export async function addFilter(scope: Page | Locator, key: string, option: string) {
  await scope.getByTestId("filter-add").click();
  await scope.getByTestId(`filter-option-${key}`).click();
  await scope.getByTestId(`filter-editor-${key}`).getByRole("option", { name: option, exact: true }).click();
}

/** Changes a filter that is in use: its chip, then the new value. */
export async function changeFilter(scope: Page | Locator, key: string, option: string) {
  await scope.getByTestId(`filter-chip-${key}`).getByRole("button").first().click();
  await scope.getByTestId(`filter-editor-${key}`).getByRole("option", { name: option, exact: true }).click();
}

/** Types a text (or date, YYYY-MM-DD) filter that is not in use and applies it. */
export async function typeFilter(scope: Page | Locator, key: string, text: string) {
  await scope.getByTestId("filter-add").click();
  await scope.getByTestId(`filter-option-${key}`).click();
  const input = scope.getByTestId(`filter-editor-${key}`).locator("input");
  await input.fill(text);
  await input.press("Enter");
}

/** Changes a text (or date) filter that is in use: its chip, the new text, Enter. An empty text removes it. */
export async function retypeFilter(scope: Page | Locator, key: string, text: string) {
  await scope.getByTestId(`filter-chip-${key}`).getByRole("button").first().click();
  const input = scope.getByTestId(`filter-editor-${key}`).locator("input");
  await input.fill(text);
  await input.press("Enter");
}

/** Removes a filter (its chip's ×). */
export async function removeFilter(scope: Page | Locator, key: string) {
  await scope.getByTestId(`filter-remove-${key}`).click();
}

/** The filter's chip shows this value (or, with null, the filter is not in use). */
export async function expectFilter(scope: Page | Locator, key: string, value: string | null) {
  if (value === null) await expect(scope.getByTestId(`filter-chip-${key}`)).toHaveCount(0);
  else await expect(scope.getByTestId(`filter-chip-${key}`)).toContainText(value);
}
