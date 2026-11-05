"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during server rendering and the first client render, true once React
 * has hydrated. Used to keep form buttons disabled until the JavaScript
 * handlers exist, so a fast click cannot trigger a native form submission
 * (which would put field values such as passwords in the URL).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
