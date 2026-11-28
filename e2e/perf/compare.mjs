// node e2e/perf/compare.mjs <before.json> <after.json>: per role and page, time to settled, API requests, sequential
// waves and duplicate requests, before → after; then totals and medians. Prints Markdown.
import { readFileSync } from "node:fs";

const [beforeFile, afterFile] = process.argv.slice(2);
/** A results file: the .json of one run, or the .jsonl lines (one visit each). */
const load = (f) => {
  const text = readFileSync(f, "utf8");
  if (!f.endsWith(".jsonl")) return JSON.parse(text);
  const visits = text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  return { latencyMs: visits[0]?.latencyMs, visits };
};
const before = load(beforeFile);
const after = load(afterFile);
const key = (v) => `${v.role} ${v.kind} ${v.href}`;
const index = (r) => new Map(r.visits.map((v) => [key(v), v]));
const b = index(before), a = index(after);
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const sec = (ms) => (ms / 1000).toFixed(2);

const rows = [];
for (const [k, vb] of b) {
  const va = a.get(k);
  if (!va) continue;
  rows.push({ role: vb.role, kind: vb.kind, href: vb.href, tb: vb.settledMs, ta: va.settledMs, cb: vb.calls, ca: va.calls, wb: vb.waves, wa: va.waves, db: vb.duplicates.length, da: va.duplicates.length, dupB: vb.duplicates, dupA: va.duplicates });
}

console.log(`Latency added per request: ${before.latencyMs} ms (before) / ${after.latencyMs} ms (after)\n`);
for (const kind of ["load", "click"]) {
  const rs = rows.filter((r) => r.kind === kind);
  console.log(`## ${kind === "load" ? "Full page load (portal home)" : "Menu clicks"} — ${rs.length} pages`);
  console.log(`median time to settled: ${sec(median(rs.map((r) => r.tb)))} s → ${sec(median(rs.map((r) => r.ta)))} s`);
  console.log(`total API requests: ${rs.reduce((n, r) => n + r.cb, 0)} → ${rs.reduce((n, r) => n + r.ca, 0)}; median sequential waves ${median(rs.map((r) => r.wb))} → ${median(rs.map((r) => r.wa))}; pages with duplicate requests ${rs.filter((r) => r.db).length} → ${rs.filter((r) => r.da).length}\n`);
  console.log("| role | page | settled before | after | API requests | waves | duplicates |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rs) console.log(`| ${r.role} | ${r.href} | ${sec(r.tb)} s | ${sec(r.ta)} s | ${r.cb} → ${r.ca} | ${r.wb} → ${r.wa} | ${r.db} → ${r.da} |`);
  console.log("");
}
const dups = rows.filter((r) => r.db).flatMap((r) => r.dupB.map((d) => `${r.role} ${r.href}: ${d}`));
if (dups.length) { console.log("### Duplicate requests before"); for (const d of dups) console.log(`- ${d}`); }
const dupsA = rows.filter((r) => r.da).flatMap((r) => r.dupA.map((d) => `${r.role} ${r.href}: ${d}`));
if (dupsA.length) { console.log("\n### Duplicate requests after"); for (const d of dupsA) console.log(`- ${d}`); }
