// Module resolution for `npm test` only (not used by the app or its build):
// lets node --test import the app's TypeScript modules as they are written —
// `@/…` (tsconfig "paths") and extensionless relative imports such as "./x".
// Node strips the TypeScript types itself; .tsx (JSX) is not supported.
const ROOT = new URL("../", import.meta.url);
const EXTENSIONS = [".ts", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), ROOT).href;
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("file:");
    if (!relative || /\.[cm]?[jt]sx?$/.test(specifier)) throw error;
    for (const ext of EXTENSIONS) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // try the next extension
      }
    }
    throw error;
  }
}
