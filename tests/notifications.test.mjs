// Decision notifications: how the new in-app types are shown (lib/notifications/display.ts) and
// the administrators' delivery log rules (lib/admin/notification-deliveries.ts) and menu item.
import { test } from "node:test";
import assert from "node:assert/strict";

import { CATEGORY_LABELS, DECISION_NOTIFICATION_TYPES, isKnownCategory, notificationVisual } from "../lib/notifications/display.ts";
import {
  DELIVERY_STATUS_FILTERS,
  DELIVERY_STATUS_META,
  DELIVERY_TYPE_FILTERS,
  NOTIFICATION_DELIVERIES_PERMISSION,
  canRetryDelivery,
  deliveryEntityLabel,
  deliveryLogVisible,
  deliveryQuery,
  deliveryStatusLabel,
  deliveryTypeLabel,
  retryErrorMessage,
} from "../lib/admin/notification-deliveries.ts";
import { ADMIN_NAV, ADMIN_NOTIFICATION_DELIVERIES, canSeeNavItem, visibleNav } from "../lib/auth/navigation.ts";

const NEW_TYPES = ["school.request.verified", "teacher.application.approved", "coach.application.approved", "permissions.granted"];

// ─── In-app notification display ────────────────────────────────────────────

test("display: the four decision types have their own icon and label, whatever their category", () => {
  assert.deepEqual(notificationVisual({ type: "school.request.verified", category: "ACCOUNT" }), { visual: "SCHOOL_VERIFIED", label: "School verified" });
  assert.deepEqual(notificationVisual({ type: "teacher.application.approved", category: "ACCOUNT" }), { visual: "APPROVED", label: "Application approved" });
  assert.deepEqual(notificationVisual({ type: "coach.application.approved", category: "SOMETHING_NEW" }), { visual: "APPROVED", label: "Application approved" });
  assert.deepEqual(notificationVisual({ type: "permissions.granted", category: "ACCOUNT" }), { visual: "PERMISSIONS", label: "Permissions" });
  assert.deepEqual(Object.keys(DECISION_NOTIFICATION_TYPES).sort(), [...NEW_TYPES].sort());
});

test("display: other types are shown by their category", () => {
  assert.deepEqual(notificationVisual({ type: "assignment.published", category: "ASSIGNMENTS" }), { visual: "ASSIGNMENTS", label: "Assignments" });
  assert.deepEqual(notificationVisual({ type: "discussion.reply", category: "DISCUSSIONS" }), { visual: "DISCUSSIONS", label: "Discussions" });
  for (const c of Object.keys(CATEGORY_LABELS)) assert.equal(notificationVisual({ type: "x", category: c }).visual, c);
});

test("display: unknown types and categories still render (as Account); never inherited object keys", () => {
  assert.deepEqual(notificationVisual({ type: "brand.new.type", category: "BRAND_NEW" }), { visual: "ACCOUNT", label: "Account" });
  assert.deepEqual(notificationVisual({ type: "toString", category: "constructor" }), { visual: "ACCOUNT", label: "Account" });
  assert.deepEqual(notificationVisual({ type: null, category: null }), { visual: "ACCOUNT", label: "Account" });
  assert.deepEqual(notificationVisual({}), { visual: "ACCOUNT", label: "Account" });
  assert.equal(isKnownCategory("ACCOUNT"), true);
  assert.equal(isKnownCategory("hasOwnProperty"), false);
});

// ─── Delivery log ───────────────────────────────────────────────────────────

const row = (over = {}) => ({
  id: "d1", type: "teacher.application.approved", recipientEmail: "t@example.com", recipientUserId: "u1",
  entityType: "TeacherApplication", entityId: "1a2b3c4d-0000-4000-8000-000000000000", status: "FAILED", attempts: 3,
  lastError: "SMTP timeout", createdAt: "2026-11-13T10:00:00.000Z", sentAt: null, nextAttemptAt: null, ...over,
});

test("delivery log: status labels and filters cover the four statuses", () => {
  assert.deepEqual(Object.keys(DELIVERY_STATUS_META).sort(), ["FAILED", "PENDING", "SENDING", "SENT"]);
  assert.equal(deliveryStatusLabel("PENDING"), "Waiting");
  assert.equal(deliveryStatusLabel("FAILED"), "Failed");
  assert.equal(deliveryStatusLabel("ODD"), "ODD", "unknown status shown as is");
  assert.deepEqual(DELIVERY_STATUS_FILTERS.map((f) => f.value).sort(), ["", "FAILED", "PENDING", "SENDING", "SENT"]);
});

test("delivery log: type filter lists the four decision types; labels fall back to the raw type", () => {
  assert.equal(DELIVERY_TYPE_FILTERS[0].value, "");
  assert.deepEqual(DELIVERY_TYPE_FILTERS.slice(1).map((f) => f.value).sort(), [...NEW_TYPES].sort());
  assert.equal(deliveryTypeLabel("permissions.granted"), "Permissions granted");
  assert.equal(deliveryTypeLabel("coach.application.approved"), "Coach application approved");
  assert.equal(deliveryTypeLabel("other.type"), "other.type");
  assert.equal(deliveryTypeLabel("toString"), "toString");
});

test("delivery log: query omits empty filters and clamps the page", () => {
  assert.deepEqual(deliveryQuery("", "", 1), { page: 1, limit: 25 });
  assert.deepEqual(deliveryQuery("FAILED", "permissions.granted", 3), { status: "FAILED", type: "permissions.granted", page: 3, limit: 25 });
  assert.equal(deliveryQuery("", "", 0).page, 1);
  assert.equal(deliveryQuery("", "", Number.NaN).page, 1);
});

test("delivery log: Retry only for FAILED; 409 / 404 explained, others left to the generic message", () => {
  assert.equal(canRetryDelivery(row()), true);
  for (const status of ["PENDING", "SENDING", "SENT"]) assert.equal(canRetryDelivery(row({ status })), false, status);
  assert.match(retryErrorMessage({ status: 409, code: "CONFLICT" }), /already sent or being sent/);
  assert.ok(retryErrorMessage({ status: 404, code: "NOT_FOUND" }));
  assert.equal(retryErrorMessage({ status: 500, code: "ERROR" }), null);
  assert.equal(retryErrorMessage(null), null);
});

test("delivery log: related item is readable and the id shortened", () => {
  assert.equal(deliveryEntityLabel(row()), "Teacher application 1a2b3c4d…");
  assert.equal(deliveryEntityLabel(row({ entityType: "MentorRequest", entityId: "r1" })), "Coach application r1");
  assert.equal(deliveryEntityLabel(row({ entityType: "Mystery", entityId: "x" })), "Mystery x");
});

test("delivery log: page and menu gated by the single constant email.bulkSend", () => {
  assert.equal(NOTIFICATION_DELIVERIES_PERMISSION, "email.bulkSend");
  assert.equal(ADMIN_NOTIFICATION_DELIVERIES.permission, NOTIFICATION_DELIVERIES_PERMISSION);
  assert.equal(ADMIN_NOTIFICATION_DELIVERIES.href, "/admin/notification-deliveries");
  assert.ok(!ADMIN_NAV.some((i) => i.href === ADMIN_NOTIFICATION_DELIVERIES.href), "kept out of the frozen ADMIN_NAV");

  const can = (...held) => (p) => held.includes(p);
  assert.equal(deliveryLogVisible("ready", can("email.bulkSend")), true);
  assert.equal(deliveryLogVisible("ready", can("users.manage")), false);
  assert.equal(deliveryLogVisible("loading", can("email.bulkSend")), false);
  assert.equal(deliveryLogVisible("error", can("email.bulkSend")), false);

  assert.equal(canSeeNavItem(ADMIN_NOTIFICATION_DELIVERIES, new Set(["email.bulkSend"])), true);
  assert.equal(canSeeNavItem(ADMIN_NOTIFICATION_DELIVERIES, new Set(["users.manage"])), false, "a DENY override hides it");
  assert.deepEqual(visibleNav([ADMIN_NOTIFICATION_DELIVERIES], new Set()), []);
});
