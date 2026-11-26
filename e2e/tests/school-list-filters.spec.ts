/**
 * School list filters on every field of the NESA file (owner 2026-11-23), in a real browser against the real backend and
 * PostgreSQL: ownership, day / boarding, cell, village, a contact typed the way people write it, with or without an
 * e-mail; a school found by its contact opens on its Contacts tab with the contact shown. Kept in the URL.
 * Synthetic data only; names and contacts are unique per run.
 */
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";
import { addFilter, changeFilter, expectFilter, removeFilter, retypeFilter, typeFilter } from "../support/filters";

const run = Date.now().toString(36);
const prefix = `E2E Filt ${run}`;
const name = { a: `${prefix} Academy`, b: `${prefix} College` };
const email = `info.${run}@filters-e2e.rw`;
// A unique Rwandan mobile number, stored as the backend stores it (E.164).
const digits = String(Date.now() % 10_000_000).padStart(7, "0");
const phone = { stored: `+25078${digits}`, typed: `078 ${digits.slice(0, 3)} ${digits.slice(3)}` };
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  await withDb(async (c) => {
    const school = async (n: string, ownership: string, accommodation: string, cell: string, village: string) => (await c.query<{ id: string }>(
      `INSERT INTO "School" (id, name, location, "countryCode", province, district, sector, cell, village, ownership, accommodation, source)
       VALUES (gen_random_uuid()::text, $1, 'Bugesera', 'RW', 'Eastern Province', 'Bugesera', 'Gashora', $2, $3, $4, $5::"SchoolAccommodation", 'ADMIN') RETURNING id`,
      [n, cell, village, ownership, accommodation],
    )).rows[0].id;
    ids.a = await school(name.a, "PRIVATE", "BOARDING", `Gihanama${run}`, `Biryogo${run}`);
    ids.b = await school(name.b, "PUBLIC", "DAY", `Kagomasi${run}`, `Kiruhura${run}`);
    for (const [type, value, raw] of [["EMAIL", email, email], ["PHONE", phone.stored, phone.typed]]) {
      await c.query(
        `INSERT INTO "SchoolContact" (id, "schoolId", type, value, "rawValue") VALUES (gen_random_uuid()::text, $1, $2::"SchoolContactType", $3, $4)`,
        [ids.a, type, value, raw],
      );
    }
  });
});

test.describe.serial("School list filters", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.close());

  const rows = () => page.getByTestId("school-row");
  const names = () => rows().getByTestId("school-name");
  const open = async () => {
    await page.goto("/admin/schools");
    await page.getByRole("searchbox", { name: "Search schools by name or code" }).fill(prefix);
    await expect(page.getByTestId("school-count")).toHaveText("2 schools match the filters");
  };

  test("ownership, day / boarding, cell and village narrow the list and stay in the URL", async () => {
    await open();
    await addFilter(page, "ownership", "Private");
    await expect(page).toHaveURL(/ownership=PRIVATE/);
    await expect(names()).toHaveText([name.a]);
    await removeFilter(page, "ownership");
    await addFilter(page, "accommodation", "Day");
    await expect(names()).toHaveText([name.b]);
    await removeFilter(page, "accommodation");
    await typeFilter(page, "cell", `gihanama${run}`);
    await expect(page).toHaveURL(/cell=gihanama/);
    await expect(names()).toHaveText([name.a]);
    await removeFilter(page, "cell");
    await typeFilter(page, "village", `Kiruhura${run}`);
    await expect(names()).toHaveText([name.b]);
    await page.reload();
    await expect(names()).toHaveText([name.b]);
    await expectFilter(page, "village", `Kiruhura${run}`);
  });

  test("with or without an e-mail", async () => {
    await open();
    await addFilter(page, "email", "Has an e-mail");
    await expect(names()).toHaveText([name.a]);
    await changeFilter(page, "email", "No e-mail");
    await expect(names()).toHaveText([name.b]);
  });

  test("a school found by its phone (typed with spaces and the leading 0) opens on its Contacts tab showing the contacts", async () => {
    await page.goto("/admin/schools");
    await typeFilter(page, "contact", "07");
    await expect(page.getByTestId("contact-too-short")).toBeVisible();
    await retypeFilter(page, "contact", phone.typed);
    await expect(page).toHaveURL(/contact=/);
    await expect(names()).toHaveText([name.a]);
    await rows().first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/schools/${ids.a}\\?tab=contacts`));
    await expect(page.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(email)).toBeVisible();
    // By e-mail, in another letter case.
    await page.goto(`/admin/schools?contact=${encodeURIComponent(email.toUpperCase())}`);
    await expect(names()).toHaveText([name.a]);
  });
});
