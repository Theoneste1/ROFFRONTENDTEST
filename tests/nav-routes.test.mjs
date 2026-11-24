// Every menu link points at a page that exists: the nav models of lib/auth/navigation.ts and
// the links written into the portal sidebars (student items, the shared bottom block).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ADMIN_NAV, ADMIN_SETTINGS, MENTOR_NAV, TEACHER_NAV } from "../lib/auth/navigation.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = join(ROOT, "app");

/** Route patterns of every app/**\/page.tsx: route groups dropped, private `_folders` are not routes. */
function routes() {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name.startsWith("_")) continue;
        walk(full);
      } else if (/^page\.(t|j)sx?$/.test(name)) {
        const segments = relative(APP, dir)
          .split(sep)
          .filter((s) => s && !/^\(.*\)$/.test(s));
        out.push(segments);
      }
    }
  })(APP);
  return out;
}

const ROUTES = routes();

function exists(href) {
  const path = href.split(/[?#]/)[0];
  const parts = path.split("/").filter(Boolean);
  return ROUTES.some(
    (r) =>
      (r.length === parts.length || (r.at(-1)?.startsWith("[...") && parts.length >= r.length)) &&
      r.every((seg, i) => seg.startsWith("[") || seg === parts[i]),
  );
}

const SIDEBARS = [
  "app/student/dashboard/components/Sidebar.tsx",
  "app/admin/dashboard/components/Sidebar.tsx",
  "app/mentor/dashboard/components/Sidebar.tsx",
  "app/teacher/components/Sidebar.tsx",
];

/** Literal links in a component's source: href="/…" and settingsHref="/…". */
function literalHrefs(file) {
  const src = readFileSync(join(ROOT, file), "utf8");
  // JSX attributes (href="…") and the sidebar item objects passed to SidebarNav (href: "…").
  return [...src.matchAll(/(?:href|settingsHref)(?:=|:\s*)["'](\/[^"']*)["']/gi)].map((m) => m[1]);
}

test("the route scan sees the app's pages (sanity)", () => {
  assert.ok(exists("/student/dashboard"));
  assert.ok(exists("/admin/schools/123"), "dynamic segments match");
  assert.ok(!exists("/admin/nowhere"));
  assert.ok(!exists("/mentor/_unsupported"), "private folders are not routes");
});

test("every nav model item (admin, settings, coach, teacher) has a page", () => {
  for (const item of [...ADMIN_NAV, ADMIN_SETTINGS, ...MENTOR_NAV, ...TEACHER_NAV]) {
    assert.ok(exists(item.href), `${item.label}: ${item.href} has no app/**/page.tsx`);
  }
});

test("every link written in the portal sidebars has a page", () => {
  for (const file of SIDEBARS) {
    const hrefs = literalHrefs(file);
    for (const href of hrefs) assert.ok(exists(href), `${file}: ${href} has no app/**/page.tsx`);
  }
  // The student menu is written in its sidebar: make sure the scan found its items.
  const student = literalHrefs(SIDEBARS[0]);
  for (const href of ["/student/dashboard", "/student/leaderboard", "/student/courses", "/student/resources", "/student/assignments", "/student/assignments/results"]) {
    assert.ok(student.includes(href), `student sidebar scan missed ${href}`);
  }
  // Help, Settings (/student/account) and Sign Out are in the profile menu only, not in the sidebar (owner 2026-11-25;
  // the profile menu's links are checked in tests/profile-menu.test.mjs).
  assert.ok(!student.includes("/student/account"), "the student sidebar has no Settings link (it is in the profile menu)");
});

test("admin menu offers Schools to every administrator (role-served, no permission)", () => {
  const schools = ADMIN_NAV.find((i) => i.href === "/admin/schools");
  assert.ok(schools);
  assert.equal(schools.permission, undefined);
});
