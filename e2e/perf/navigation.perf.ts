/**
 * Per role: a full page load of the portal home, then a click on every sidebar link. For each: the API requests made
 * (method + path), repeated identical requests, how many rounds of requests had to wait for the one before ("waves"),
 * and the time until the page settled (no spinner, no request in flight for 300 ms). Latency is added in Chromium
 * (CDP), so every request pays the round trip the hosted site pays from Kigali.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type Page, type Request } from "@playwright/test";
import { navigateViaSidebar, signIn, sidebarHrefs } from "../support/session";
import type { AccountKey } from "../support/accounts";

const LATENCY = Number(process.env.PERF_LATENCY_MS ?? 400);
const LABEL = process.env.PERF_LABEL ?? "run";
const ROLES: AccountKey[] = ["student", "teacher", "coach", "headCoach", "admin", "superAdmin"];

interface Call { method: string; path: string; start: number; end: number }
interface Visit { role: string; kind: "load" | "click"; href: string; settledMs: number; urlMs: number; calls: number; duplicates: string[]; waves: number; api: string[] }

/**
 * Waves: the longest chain of requests each of which started only after the previous one had finished (a waterfall).
 * wave(c) = 1 + the highest wave among requests that finished before c started. An upper bound on true dependencies.
 */
function waves(calls: Call[]): number {
  const sorted = [...calls].sort((a, b) => a.start - b.start);
  const w = new Map<Call, number>();
  for (const c of sorted) w.set(c, 1 + Math.max(0, ...sorted.filter((p) => p.end <= c.start).map((p) => w.get(p) ?? 0)));
  return Math.max(0, ...w.values());
}

function track(page: Page) {
  const calls: Call[] = [];
  const open = new Map<Request, Call>();
  const t0 = Date.now();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return;
    const c = { method: r.method(), path: u.pathname + u.search, start: Date.now() - t0, end: Infinity };
    open.set(r, c); calls.push(c);
  });
  const done = (r: Request) => { const c = open.get(r); if (c) { c.end = Date.now() - t0; open.delete(r); } };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return { calls, inFlight: () => open.size, now: () => Date.now() - t0 };
}

async function settle(page: Page, inFlight: () => number) {
  let quietSince = Date.now();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const busy = inFlight() > 0 || (await page.locator(".animate-spin:visible, [role=status]:visible").count()) > 0;
    if (busy) quietSince = Date.now();
    else if (Date.now() - quietSince >= 300) return Date.now() - 300;
    await page.waitForTimeout(25);
  }
  return Date.now();
}

function summarise(role: string, kind: Visit["kind"], href: string, calls: Call[], from: number, settledAt: number, urlAt: number): Visit {
  const mine = calls.filter((c) => c.start >= from);
  const keys = mine.map((c) => `${c.method} ${c.path}`);
  const duplicates = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  return { role, kind, href, settledMs: settledAt, urlMs: urlAt, calls: mine.length, duplicates, waves: waves(mine), api: keys };
}

const results: Visit[] = [];
/** Appended after every page (one JSON line each), so a worker restart or an interrupted run loses nothing. */
let saved = 0;
function save() {
  const dir = join(__dirname, "results");
  mkdirSync(dir, { recursive: true });
  for (const v of results.slice(saved)) appendFileSync(join(dir, `${LABEL}.jsonl`), `${JSON.stringify({ latencyMs: LATENCY, ...v })}\n`);
  saved = results.length;
}

for (const role of ROLES) {
  test(`navigation: ${role}`, async ({ page }) => {
    await signIn(page, role);
    const home = new URL(page.url()).pathname;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: LATENCY, downloadThroughput: -1, uploadThroughput: -1 });
    const t = track(page);

    // A full page load (opening the site / reloading): HTML, scripts, session restore, the page's data.
    let from = t.now();
    const start = Date.now();
    await page.goto(home);
    const urlAt = Date.now() - start;
    results.push(summarise(role, "load", home, t.calls, from, (await settle(page, t.inFlight)) - start, urlAt));
    save();

    const { all } = await sidebarHrefs(page, { openGroups: true });
    for (const href of all) {
      if (href === new URL(page.url()).pathname) continue;
      from = t.now();
      const s = Date.now();
      // Items under "More" are opened first (navigateViaSidebar); a link that cannot be reached is skipped, never waited on.
      const reached = await Promise.race([
        navigateViaSidebar(page, href).then(() => true, () => false),
        page.waitForTimeout(30_000).then(() => false),
      ]);
      if (!reached) { console.log(`skipped ${role} ${href}`); continue; }
      const u = Date.now() - s;
      results.push(summarise(role, "click", href, t.calls, from, (await settle(page, t.inFlight)) - s, u));
      save();
    }
  });
}

test.afterAll(() => save());
