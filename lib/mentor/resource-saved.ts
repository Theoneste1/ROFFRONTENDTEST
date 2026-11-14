/**
 * The confirmation shown on the resources list after the upload / edit form
 * returns to it. The form adds `saved=<outcome>` to the list URL; the list shows
 * the message once and removes the parameter. Pure; tested in tests/programmes.test.mjs.
 */
export type ResourceSaved = "uploaded" | "uploaded-published" | "updated" | "updated-published";

export function resourceSavedOutcome(isEdit: boolean, published: boolean): ResourceSaved {
  return `${isEdit ? "updated" : "uploaded"}${published ? "-published" : ""}` as ResourceSaved;
}

const MESSAGES: Record<ResourceSaved, string> = {
  uploaded: "Resource uploaded. It is not published yet — students can't see it until you publish it (row menu → Publish).",
  "uploaded-published": "Resource uploaded and published — students of the division can now see it.",
  updated: "Changes saved.",
  "updated-published": "Changes saved and the resource is published — students of the division can now see it.",
};

/** The message for a `saved` URL parameter, or null for anything else. */
export function resourceSavedMessage(value: string | null | undefined): string | null {
  return value && Object.hasOwn(MESSAGES, value) ? MESSAGES[value as ResourceSaved] : null;
}
