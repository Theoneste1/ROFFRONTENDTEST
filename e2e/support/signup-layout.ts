/**
 * The registration forms fit the window (app/components/forms/FormWizard, app/components/shell/AuthShell): helpers that
 * measure the shown step (no page scroll, no scrollbar in the card, every field and the buttons inside the window, nothing
 * overlapping) and fill the shown step with valid answers, whatever the grouping of the layout.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** A school of the seeded directory with a full location (the cascades need province, district and sector). */
export const LAYOUT_SCHOOL = { name: "ACEJ KARAMA", province: "Southern Province", district: "Muhanga", sector: "Muhanga" };

/** What is wrong with the shown step's layout (an empty list: it fits). */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.scrollingElement as HTMLElement;
    if (doc.scrollHeight > doc.clientHeight) problems.push(`the page scrolls (${doc.scrollHeight} > ${doc.clientHeight})`);
    if (doc.scrollWidth > doc.clientWidth) problems.push(`the page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`);
    const card = document.querySelector<HTMLElement>('[data-testid="auth-card"]');
    if (!card) return ["no card"];
    // No element of the card has a scrollbar of its own (nor anything around it, up to the page).
    for (const el of [card, ...card.querySelectorAll<HTMLElement>("*")]) {
      const s = getComputedStyle(el);
      const scrollable = /(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflowX);
      if (scrollable && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT" && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1))
        problems.push(`${el.tagName.toLowerCase()}[data-testid=${el.dataset.testid ?? ""}] scrolls`);
    }
    for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) problems.push(`${el.tagName.toLowerCase()} around the card scrolls`);
    }
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${(el as HTMLElement).dataset.testid ? `[${(el as HTMLElement).dataset.testid}]` : ""}${el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    // Every field, label, hint, error and button of the shown step (and the progress and the buttons) is inside the window.
    const items = [
      ...card.querySelectorAll('[data-testid="wizard-fields"] [data-shown] :is(label, legend, input, select, textarea, p, button, dl)'),
      ...card.querySelectorAll('[data-testid="wizard-actions"] :is(button, p, a)'),
      ...card.querySelectorAll('[data-testid="wizard-progress-bar"], [data-testid="wizard-step"] h2:not([hidden] *)'),
      ...card.querySelectorAll('[data-testid="wizard-body"] [role="alert"]'),
    ].filter(visible);
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.top < -0.5 || r.left < -0.5 || r.bottom > vh + 0.5 || r.right > vw + 0.5) problems.push(`${describe(el)} is outside the window (${Math.round(r.top)}–${Math.round(r.bottom)} of ${vh})`);
    }
    // Nothing overlaps: labels, hints, errors and controls of the shown step and the buttons (an element and what it
    // contains are not compared, nor a check box with its own label).
    const leaves = items.filter((el) => !items.some((o) => o !== el && el.contains(o) && !(el.tagName === "LABEL")));
    for (let i = 0; i < leaves.length; i++)
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i];
        const b = leaves[j];
        if (a.contains(b) || b.contains(a)) continue;
        // A control drawn inside its field on purpose (the password's show / hide button).
        const inside = (x: Element) => getComputedStyle(x).position === "absolute";
        if (a.parentElement === b.parentElement && (inside(a) || inside(b))) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) problems.push(`${describe(a)} overlaps ${describe(b)}`);
      }
    return problems;
  });
}

/** The buttons of the wide layout are not stretched: narrower than the card's row and at least 120px wide. */
export async function buttonProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="wizard-actions"]');
    if (!row) return ["no button row"];
    const width = row.getBoundingClientRect().width;
    return [...row.querySelectorAll<HTMLElement>("button")]
      .map((b) => ({ name: (b.textContent ?? "").trim(), w: b.getBoundingClientRect().width }))
      .filter((b) => b.w < 119.5 || b.w >= width / 2)
      .map((b) => `"${b.name}" is ${Math.round(b.w)}px wide (row ${Math.round(width)}px)`);
  });
}

/** The shown step's number and count ("Step 2 of 5"). */
export async function stepOf(page: Page): Promise<{ step: number; count: number; title: string }> {
  const text = (await page.getByTestId("wizard-progress").textContent()) ?? "";
  const m = /Step (\d+) of (\d+)\s*·\s*(.*)$/.exec(text.trim());
  if (!m) throw new Error(`no progress in "${text}"`);
  return { step: Number(m[1]), count: Number(m[2]), title: m[3].trim() };
}

async function choose(select: Locator, label: string | RegExp) {
  await expect(select).toBeEnabled({ timeout: 30_000 });
  const option = select.locator("option", { hasText: label }).first();
  await expect(option).toBeAttached({ timeout: 30_000 });
  await select.selectOption((await option.getAttribute("value"))!);
}

/** Valid answers for the fields of the shown step (only those still empty; the optional picture is left out). */
export async function fillShownStep(page: Page, who: { username: string; lastName: string; password: string }) {
  const step = page.locator('[data-testid="wizard-fields"] > [data-shown]');
  const TEXT: Record<string, string> = {
    firstName: "Aline",
    lastName: who.lastName,
    dateOfBirth: "2011-06-15",
    phone: "0788123456",
    guardianPhone: "0788123456",
    email: `${who.username}@e2e.local`,
    username: who.username,
    "new-password": who.password,
    "confirm-password": who.password,
    position: "Mathematics teacher",
    occupation: "Engineer",
    yearsOfExperience: "3",
    affiliation: "University of Rwanda",
    expertise: "Combinatorics",
    relevantExperience: "Three years coaching olympiad teams.",
    homeLocation: "Nairobi",
    schoolName: "Lycée de Kigali",
    schoolLocation: "Nyarugenge",
  };
  const SELECT: Record<string, string | RegExp> = {
    "home-country": "Rwanda",
    "coach-country": "Rwanda",
    "cascade-country": "Rwanda",
    "cascade-province": LAYOUT_SCHOOL.province,
    "cascade-district": LAYOUT_SCHOOL.district,
    "cascade-sector": LAYOUT_SCHOOL.sector,
    "cascade-school": LAYOUT_SCHOOL.name,
    "home-province": "Kigali City",
    "home-district": "Gasabo",
    "coach-education": "Bachelor",
  };
  const controls = step.locator("input, select, textarea");
  const n = await controls.count();
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    const tag = await c.evaluate((el) => el.tagName);
    const name = (await c.getAttribute("name")) ?? "";
    const type = (await c.getAttribute("type")) ?? "";
    const testId = (await c.getAttribute("data-testid")) ?? "";
    if (type === "file" || testId === "teacher-school-country" || !(await c.isVisible())) continue;
    if (tag === "SELECT") {
      // A dropdown of a cascade is enabled once the one before it is chosen (choose waits for it).
      if (await c.inputValue()) continue;
      const label = await c.evaluate((el) => (el as HTMLSelectElement).labels?.[0]?.textContent ?? "");
      if (testId in SELECT) await choose(c, SELECT[testId]);
      else if (name === "gradeLevel") await c.selectOption("S2");
      else if (/^Country/.test(label)) await choose(c, "Rwanda");
      else if (/^Home district/.test(label)) await choose(c, "Gasabo");
      else {
        await expect(c).toBeEnabled({ timeout: 30_000 });
        await expect(c.locator("option").nth(1)).toBeAttached({ timeout: 30_000 });
        await c.selectOption({ index: 1 });
      }
    } else if (type === "checkbox") {
      if ((await step.locator(`input[type=checkbox][name="${name}"]:checked`).count()) === 0) await c.check();
    } else if (name in TEXT && !(await c.isDisabled()) && !(await c.inputValue())) {
      await c.fill(TEXT[name]);
    }
  }
}
