// The profile menu (lib/accounts/profile-menu.ts): four options in order, each page exists for every role.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { accountTitle, profileMenuItems } from "../lib/accounts/profile-menu.ts";
import { ROLES } from "../lib/auth/role-rules.ts";

const APP = fileURLToPath(new URL("../app/", import.meta.url));
const ROUTES = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (!name.startsWith("_")) walk(full); }
    else if (/^page\.(t|j)sx?$/.test(name)) ROUTES.push("/" + relative(APP, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s)).join("/"));
  }
})(APP);

test("exactly My Profile, Settings, User guide, Help and Support, Logout — in that order — for every role", () => {
  for (const role of [...ROLES, "UNKNOWN_ROLE", null]) {
    assert.deepEqual(profileMenuItems(role).map((i) => i.label), ["My Profile", "Settings", "User guide", "Help and Support", "Logout"], String(role));
    assert.equal(profileMenuItems(role).at(-1).href, undefined, "Logout is an action, not a page");
  }
});

test("destinations: the role's own profile, settings and user guide, and the shared support page — each page exists", () => {
  const expected = {
    STUDENT: ["/student/profile", "/student/account", "/student/guide"],
    MENTOR: ["/mentor/profile", "/mentor/account", "/mentor/guide"],
    HEAD_COACH: ["/mentor/profile", "/mentor/account", "/mentor/guide"],
    TEACHER: ["/teacher/profile", "/teacher/account", "/teacher/guide"],
    ADMIN: ["/admin/profile", "/admin/account", "/admin/guide"],
    SUPER_ADMIN: ["/admin/profile", "/admin/account", "/admin/guide"],
  };
  for (const role of ROLES) {
    const [profile, settings, guide, help] = profileMenuItems(role);
    assert.deepEqual([profile.href, settings.href, guide.href], expected[role], role);
    assert.equal(help.href, "/support");
    for (const href of [profile.href, settings.href, guide.href, help.href]) assert.ok(ROUTES.includes(href), `${role}: ${href} has no page`);
  }
});

test("Settings pages are working pages (password, sessions, notifications), never placeholders", () => {
  for (const portal of ["student", "mentor", "teacher", "admin"]) {
    const src = readFileSync(join(APP, portal, "account", "page.tsx"), "utf8");
    assert.match(src, /AccountSettingsPage/, portal);
  }
  const page = readFileSync(join(APP, "components", "account", "AccountSettingsPage.tsx"), "utf8");
  for (const piece of ["PasswordForm", "SessionsCard", "NotificationPreferences"]) assert.match(page, new RegExp(`<${piece}\\b`));
});

test("account title: the backend role in words (never the e-mail); Super Administrator included; no Content Manager", () => {
  assert.deepEqual(ROLES.map(accountTitle), ["Student", "Teacher", "Coach", "Head Coach", "Administrator", "Super Administrator"]);
  assert.equal(accountTitle("CONTENT_MANAGER"), "Unknown account type");
  assert.equal(accountTitle(undefined), "Unknown account type");
});
