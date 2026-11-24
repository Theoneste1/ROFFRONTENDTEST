/**
 * Directory sync — the school code is the identifier (owner decision 2026-11-22), in a real browser against the real
 * backend and PostgreSQL:
 *  1. the upload form imports "New schools only" by default;
 *  2. a dry run of a NESA-shaped CSV (the published header spelling "Combinations / Trades / Other Programmes")
 *     shows the four numbers: schools found, already in the directory (left untouched), new to import, needs attention;
 *  3. a row without a usable code needs attention and is not proposed as a new school.
 * Fixtures (fresh per run, synthetic): one official school with a code. A dry run writes no school.
 */
import { expect, test } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const base = 200_000 + (Date.now() % 90_000);   // Southern Province codes (first digit 2), unique per run
const existingCode = String(base);
const newCode = String(base + 1);
const existingName = `E2E SYNC EXISTING ${run}`.toUpperCase();

const HEADER = "No.,Province,District,Sector,Cell,Village,School Code,School Name,Accommodation,School Status,Email,Phone,Pre-Primary,Primary,O-Level,A-Level,Combinations / Trades / Other Programmes,All Education Levels (as listed by NESA)";
const row = (n: number, code: string, name: string) =>
  `${n},South,Huye,Ngoma,Butare,Gako,${code},${name},DAY,PUBLIC,,,,Yes,,,,PRIMARY (PR)`;
const CSV = [HEADER, row(1, existingCode, existingName), row(2, newCode, `E2E SYNC NEW ${run}`.toUpperCase()), row(3, "N/A", `E2E SYNC NO CODE ${run}`.toUpperCase())].join("\r\n") + "\r\n";

test.beforeAll(async () => {
  await withDb(async (c) => {
    await c.query(
      `INSERT INTO "School" (id, name, location, code, province, district, sector, "nameKey", source, "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Ngoma, Huye', $2, 'Southern Province', 'Huye', 'Ngoma', lower($1), 'OFFICIAL_LIST', now())`,
      [existingName, existingCode],
    );
  });
});

test("a dry run recognises the existing school by code, proposes only the new one, and flags the row without a code", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/schools/sync");
  await expect(page.getByTestId("sync-mode")).toHaveValue("NEW_ONLY");
  await page.getByTestId("sync-file").setInputFiles({ name: "School Data - All Schools.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByTestId("sync-start").click();
  await page.waitForURL(/\/admin\/schools\/sync\/[0-9a-f-]{36}$/);

  const headline = page.getByTestId("sync-headline");
  await expect(headline).toBeVisible();
  // A metric card: its label, its value, its explanation.
  // A headline figure (MetricCard, marked data-metric) by its label — independent of the card styling.
  const card = (label: string) => headline.locator("[data-metric]").filter({ has: page.getByText(label, { exact: true }) });
  const value = (label: string) => card(label).locator("p").nth(1);
  await expect(value("Schools found")).toHaveText("3");
  await expect(value("Already in the directory")).toHaveText("1");
  await expect(card("Already in the directory")).toContainText("left untouched");
  await expect(value("New schools to import")).toHaveText("1");
  await expect(value("Needs attention")).toHaveText("1");

  // Nothing was written to the directory: the new school does not exist yet.
  const count = await withDb(async (c) => (await c.query(`SELECT count(*)::int AS n FROM "School" WHERE code = $1`, [newCode])).rows[0].n);
  expect(count).toBe(0);
});
