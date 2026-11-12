/**
 * Progress of the multipart uploads in flight in this tab.
 *
 * `fetch` cannot report upload progress, so the API client sends multipart
 * bodies with XMLHttpRequest and reports here; `<UploadProgress />` shows one
 * indicator for all of them. No component needs to wire anything up.
 */

export interface UploadState {
  loaded: number;
  total: number;
  /** All bytes sent; waiting for the server to store the files and answer. */
  processing: boolean;
}

let nextId = 0;
const uploads = new Map<number, UploadState>();
const listeners = new Set<() => void>();
let snapshot: readonly UploadState[] = [];

function emit() {
  snapshot = Array.from(uploads.values());
  listeners.forEach((l) => l());
}

export function subscribeUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUploads(): readonly UploadState[] {
  return snapshot;
}

const EMPTY: readonly UploadState[] = [];
export function getServerUploads(): readonly UploadState[] {
  return EMPTY;
}

/** Start tracking one upload; returns its update and finish callbacks. */
export function trackUpload(total: number) {
  const id = ++nextId;
  uploads.set(id, { loaded: 0, total, processing: false });
  emit();
  return {
    progress(loaded: number, total2: number) {
      const t = total2 || total;
      uploads.set(id, { loaded, total: t, processing: t > 0 && loaded >= t });
      emit();
    },
    done() {
      uploads.delete(id);
      emit();
    },
  };
}

/** Totals across every upload in flight (for one combined indicator). */
export function summarise(list: readonly UploadState[]): { loaded: number; total: number; processing: boolean } | null {
  if (list.length === 0) return null;
  const loaded = list.reduce((s, u) => s + u.loaded, 0);
  const total = list.reduce((s, u) => s + u.total, 0);
  return { loaded, total, processing: list.every((u) => u.processing) };
}
