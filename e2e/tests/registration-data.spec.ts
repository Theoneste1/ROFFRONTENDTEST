/**
 * Registration data (owner 2026-11-23), in a real browser against the real backend and PostgreSQL:
 *  1. Super Administrators only: an Administrator has no menu entry and the page says what it needs.
 *  2. A Super Administrator opens it from the menu, picks columns from every registration field (saved per category,
 *     kept after a reload), filters with AND / OR conditions and sorts — the server does the work.
 *  3. A filter is saved, then reopened from the saved filters after a reload.
 *  4. The CSV export has the chosen columns in order and only the matching rows.
 *  5. A record is opened and edited: a wrong phone is refused next to the field in plain words; then saved — checked in
 *     the database with its audit entry.
 * Fixtures are synthetic and unique per run.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createSchool, createStudent, withDb } from "../support/db";
import { navigateViaSidebar, signIn } from "../support/session";

const run = Date.now().toString(36);
const first = [`Rdala${run}`, `Rdbeni${run}`, `Rdcyusa${run}`];
const schoolName = `E2E Registration School ${run}`;
const ids: string[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await withDb(async (c) => {
    const school = await createSchool(c, schoolName);
    for (const [i, name] of first.entries()) ids.push(await createStudent(c, `e2e.rd.${run}.${i}`, name, school, "VERIFIED"));
    await c.query(`UPDATE "User" SET gender = 'FEMALE', "guardianPhone" = '+250788000111', "olympiadInterests" = '{MATHEMATICS,PHYSICS}' WHERE id = $1`, [ids[0]]);
    await c.query(`UPDATE "User" SET gender = 'MALE', "olympiadInterests" = '{COMPUTING}' WHERE id = $1`, [ids[1]]);
    await c.query(`UPDATE "User" SET gender = 'FEMALE', "olympiadInterests" = '{}' WHERE id = $1`, [ids[2]]);
  });
});

test("Administrators do not have it: no menu entry, and the page says what it needs", async ({ page }) => {
  await signIn(page, "admin");
  await expect(page.getByTestId("sidebar-nav").first().locator('a[href="/admin/registration-data"]')).toHaveCount(0);
  await page.goto("/admin/registration-data");
  await expect(page.getByText("This page needs the registrationData.manage permission.")).toBeVisible();
});

test("columns from every registration field, saved per category; AND / OR filter; sort", async ({ page }) => {
  await signIn(page, "superAdmin");
  await navigateViaSidebar(page, "/admin/registration-data");
  await expect(page.getByRole("heading", { name: "Registration data" })).toBeVisible();
  await expect(page.getByTestId("registration-row").first()).toBeVisible();

  // Columns: first name, gender, guardian phone, subjects — in this order; saved for Students.
  await page.getByTestId("open-columns").click();
  const chosen = page.getByTestId("chosen-columns");
  for (const key of ["user.lastName", "user.email", "user.schoolId", "user.gradeLevel", "user.divisionId", "user.accountStatus", "user.createdAt"]) {
    const box = page.getByTestId(`column-${key}`);
    if (await box.isChecked()) await box.uncheck();
  }
  for (const key of ["user.gender", "user.guardianPhone", "user.olympiadInterests"]) await page.getByTestId(`column-${key}`).check();
  await expect(chosen.locator("li")).toHaveText(["First name", "Gender", "Parent or guardian phone", "Olympiad subjects"]);
  await page.getByTestId("save-columns").click();
  await expect(page.locator("thead th")).toHaveText(["First name", "Gender", "Parent or guardian phone", "Olympiad subjects"]);
  await page.reload();
  await expect(page.locator("thead th")).toHaveText(["First name", "Gender", "Parent or guardian phone", "Olympiad subjects"]);

  // Filter: first name contains this run AND (gender is Female OR subjects include Computing) → all three; then AND
  // subjects include Physics → only the first.
  await page.getByTestId("toggle-filter").click();
  await page.getByTestId("add-condition-root").click();
  await page.getByTestId("condition-0-field").selectOption("user.firstName");
  await page.getByTestId("condition-0-operator").selectOption("contains");
  await page.getByTestId("condition-0-value").fill(run);
  await page.getByTestId("add-group-root").click();
  await expect(page.getByTestId("combinator-1")).toHaveValue("OR");
  await page.getByTestId("add-condition-1").click();
  await page.getByTestId("condition-1-0-field").selectOption("user.gender");
  await page.getByTestId("condition-1-0-value").getByRole("button", { name: "Female" }).click();
  await page.getByTestId("add-condition-1").click();
  await page.getByTestId("condition-1-1-field").selectOption("user.olympiadInterests");
  await page.getByTestId("condition-1-1-value").getByRole("button", { name: "Computing" }).click();
  await page.getByTestId("apply-filter").click();
  const rows = page.getByTestId("registration-row");
  await expect(rows).toHaveCount(3);
  // Sort by first name, then the other way.
  await page.getByTestId("sort-user.firstName").click();
  await expect(rows.first()).toContainText(first[0]);
  await page.getByTestId("sort-user.firstName").click();
  await expect(rows.first()).toContainText(first[2]);

  await page.getByTestId("add-condition-root").click();
  await page.getByTestId("condition-2-field").selectOption("user.olympiadInterests");
  await page.getByTestId("condition-2-value").getByRole("button", { name: "Physics" }).click();
  await page.getByTestId("apply-filter").click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(first[0]);
  await expect(rows.first()).toContainText("+250788000111");
  await expect(rows.first()).toContainText("Mathematics, Physics");
});

test("a saved filter, reopened after a reload; the CSV export matches what is shown", async ({ page }) => {
  await signIn(page, "superAdmin");
  await page.goto("/admin/registration-data");
  await page.getByTestId("toggle-filter").click();
  await page.getByTestId("add-condition-root").click();
  await page.getByTestId("condition-0-field").selectOption("user.firstName");
  await page.getByTestId("condition-0-value").fill(run);
  await page.getByTestId("add-condition-root").click();
  await page.getByTestId("condition-1-field").selectOption("user.gender");
  await page.getByTestId("condition-1-value").getByRole("button", { name: "Female" }).click();
  await page.getByTestId("apply-filter").click();
  await expect(page.getByTestId("registration-row")).toHaveCount(2);
  await page.getByTestId("save-filter").click();
  await page.getByTestId("filter-name").fill(`Girls ${run}`);
  await page.getByTestId("confirm-save-filter").click();
  await expect(page.getByText(`Saved the filter “Girls ${run}”.`)).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("registration-row").first()).toBeVisible();
  await page.getByTestId("saved-filters").selectOption({ label: `Girls ${run}` });
  await expect(page.getByTestId("registration-row")).toHaveCount(2);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
  expect(download.suggestedFilename()).toMatch(/^registration-data-students-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split(/\r\n/);
  expect(lines[0]).toBe("First name,Gender,Parent or guardian phone,Olympiad subjects");
  expect(lines.slice(1).sort()).toEqual([`${first[0]},Female,'+250788000111,"Mathematics, Physics"`, `${first[2]},Female,,`]);
  const audit = await withDb(async (c) => (await c.query(`SELECT metadata FROM "AuditLog" WHERE action = 'REGISTRATION_DATA_EXPORTED' ORDER BY "createdAt" DESC LIMIT 1`)).rows[0]);
  expect(audit.metadata).toMatchObject({ category: "STUDENTS", format: "csv", rows: 2 });
});

test("edit a record: a wrong phone is refused next to the field; then saved, with its audit entry", async ({ page }) => {
  await signIn(page, "superAdmin");
  await page.goto("/admin/registration-data");
  await page.getByTestId("toggle-filter").click();
  await page.getByTestId("add-condition-root").click();
  await page.getByTestId("condition-0-field").selectOption("user.firstName");
  await page.getByTestId("condition-0-operator").selectOption("eq");
  await page.getByTestId("condition-0-value").fill(first[1]);
  await page.getByTestId("apply-filter").click();
  await expect(page.getByTestId("registration-row")).toHaveCount(1);
  await page.getByTestId("registration-row").first().click();

  const form = page.getByTestId("record-form");
  await expect(form.getByTestId("field-user.dateOfBirth")).toContainText("Correct date of birth");
  await expect(form.getByTestId("field-user.accountStatus")).toContainText("Change account status");
  await expect(form).not.toContainText("passwordHash");
  await form.getByTestId("field-user.phone").locator("input").fill("0788");
  await form.getByTestId("field-user.firstName").locator("input").fill(`Benjamin${run}`);
  await page.getByTestId("save-record").click();
  await expect(form.getByTestId("field-user.phone")).toContainText("use the international format with the country code");
  const unchanged = await withDb(async (c) => (await c.query(`SELECT "firstName", phone FROM "User" WHERE id = $1`, [ids[1]])).rows[0]);
  expect(unchanged).toEqual({ firstName: first[1], phone: null });

  await form.getByTestId("field-user.phone").locator("input").fill("+250 788 444 555");
  await page.getByTestId("save-record").click();
  await expect(form.getByText(/Saved\. 2 fields changed/)).toBeVisible();
  const saved = await withDb(async (c) => (await c.query(`SELECT "firstName", phone FROM "User" WHERE id = $1`, [ids[1]])).rows[0]);
  expect(saved).toEqual({ firstName: `Benjamin${run}`, phone: "+250788444555" });
  const audit = await withDb(async (c) => (await c.query(
    `SELECT a.metadata, u.username FROM "AuditLog" a JOIN "User" u ON u.id = a."actorId" WHERE a.action = 'REGISTRATION_DATA_UPDATED' AND a."entityId" = $1`, [ids[1]],
  )).rows[0]);
  expect(audit.username).toBe("e2e.super");
  expect(audit.metadata.changes).toEqual([{ field: "user.phone", label: "Phone number", changed: true }]);
  expect(audit.metadata.throughAccountRules).toEqual(["user.firstName"]);
});
