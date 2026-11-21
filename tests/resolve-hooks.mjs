// Module resolution for `npm test` only (not used by the app or its build):
// lets node --test import the app's TypeScript modules as they are written —
// `@/…` (tsconfig "paths"), extensionless relative imports such as "./x" and Next.js entry points such as "next/link".
// Node strips the TypeScript types itself; .tsx (JSX) is compiled here with the project's own
// TypeScript (transpile only, `jsx: react-jsx`), so components can be rendered with react-dom/server.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), ROOT).href;
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Next.js entry points without an exports map ("next/link" is next/link.js).
    if (/^next\/[\w-]+$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
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

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".tsx")) return nextLoad(url, context);
  const { default: ts } = await import("typescript");
  const out = ts.transpileModule(await readFile(new URL(url), "utf8"), {
    fileName: fileURLToPath(url),
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return { format: "module", source: out.outputText, shortCircuit: true };
}
