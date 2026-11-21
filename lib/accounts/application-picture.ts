/**
 * Application picture review (capability `applicationPictureReview`). Owner policy: an applicant's picture is never
 * published without an Administrator seeing it first and approving it explicitly; the default is NOT to keep it.
 * The backend keeps the picture only for `approvePicture: true` and discards it otherwise.
 * Pure; tested in tests/application-picture.test.mjs.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";

/** Show the picture review on approval: the backend advertises it and the application has a picture. */
export function pictureReviewShown(detection: BackendDetection | null | undefined, avatarFileId: string | null | undefined): boolean {
  return hasFeature(detection, "applicationPictureReview") && typeof avatarFileId === "string" && avatarFileId.length > 0;
}

/**
 * The approve body with the picture decision. Without the review (older backend, or no picture) the body is returned
 * unchanged, so nothing new is sent. With it, `approvePicture` is true only when the reviewer saw the picture (it
 * loaded) and ticked the box; anything else sends false (the picture is discarded).
 */
export function withPictureDecision<T extends object>(
  body: T,
  review: { shown: boolean; loaded: boolean; keep: boolean },
): T | (T & { approvePicture: boolean }) {
  if (!review.shown) return body;
  return { ...body, approvePicture: review.loaded && review.keep === true };
}

export const KEEP_PICTURE_LABEL = "Use this picture as the account's profile picture";
