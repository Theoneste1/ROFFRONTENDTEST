/**
 * The registration forms are one continuous form (app/components/forms/SignupForm, app/components/shell/AuthShell): helpers
 * that measure the form (nothing sideways, no scrollbar in the card, every field, label, message and button inside the
 * window's width, nothing overlapping) and fill every field with valid answers.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** A school of the seeded directory with a full location (the cascades need province, district and sector). */
export const LAYOUT_SCHOOL = { name: "ACEJ KARAMA", province: "Southern Province", district: "Muhanga", sector: "Muhanga" };

/** What is wrong with the form's layout (an empty list: it fits). */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    const doc = document.scrollingElement as HTMLElement;
    if (doc.scrollWidth > doc.clientWidth) problems.push(`the page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`);
    const card = document.querySelector<HTMLElement>('[data-testid="auth-card"]');
    if (!card) return ["no card"];
    // No element of the card has a scrollbar of its own (nor anything around it, up to the page); a dropdown list (a select, or the list box of a searchable list) scrolls by design.
    for (const el of [card, ...card.querySelectorAll<HTMLElement>("*")]) {
      const s = getComputedStyle(el);
      const scrollable = /(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflowX);
      if (scrollable && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT" && el.getAttribute("role") !== "listbox" && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1))
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
    // Every field, label, hint, error and button (and the heading, the switch and the messages) is inside the window's width
    // (the page scrolls up and down as one: the form is long).
    const items = [
      ...card.querySelectorAll('[data-testid="signup-fields"] :is(label, legend, input:not([type=file]), select, textarea, p, button, dl)'),
      ...card.querySelectorAll('[data-testid="signup-actions"] :is(button, p, a)'),
      ...card.querySelectorAll('[data-testid="signup-top"] :is(h1, nav a, [role="alert"])'),
    ].filter(visible);
    if (!items.length) problems.push("no fields");
    const top = (document.scrollingElement as HTMLElement).scrollTop;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5) problems.push(`${describe(el)} is outside the window (${Math.round(r.left)}–${Math.round(r.right)} of ${vw})`);
      if (r.top + top < -0.5) problems.push(`${describe(el)} is above the page`);
    }
    // Nothing overlaps: labels, hints, errors and controls and the button (an element and what it
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

/** The top of two fields' boxes (two fields side by side share their row). */
export async function rowOf(page: Page, a: string, b: string): Promise<{ a: number; b: number; aLeft: number; bLeft: number }> {
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const [ra, rb] = [await box(a), await box(b)];
  return { a: Math.round(ra.y), b: Math.round(rb.y), aLeft: Math.round(ra.x), bLeft: Math.round(rb.x) };
}

async function choose(select: Locator, label: string | RegExp) {
  await expect(select).toBeEnabled({ timeout: 30_000 });
  const option = select.locator("option", { hasText: label }).first();
  await expect(option).toBeAttached({ timeout: 30_000 });
  await select.selectOption((await option.getAttribute("value"))!);
}

/**
 * Valid answers for every field of the form (only those still empty; the optional picture is left out). A dropdown of a
 * cascade appears or is enabled once the one before it is chosen: the fields are gone through until nothing changes.
 */
export async function fillForm(page: Page, who: { username: string; lastName: string; password: string }) {
  for (let pass = 0; pass < 4; pass++) if (!(await fillOnce(page, who))) return;
}

/** One pass over the fields; true when something was filled. */
async function fillOnce(page: Page, who: { username: string; lastName: string; password: string }): Promise<boolean> {
  let changed = false;
  const step = page.locator('[data-testid="signup-fields"]');
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
    occupation: "Engineer",
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
      if (await c.inputValue()) continue;
      // A dropdown of a cascade is enabled once the one before it (earlier in the form) is chosen.
      if (!(await expect(c).toBeEnabled({ timeout: 5_000 }).then(() => true, () => false))) continue;
      changed = true;
      const label = await c.evaluate((el) => (el as HTMLSelectElement).labels?.[0]?.textContent ?? "");
      if (testId in SELECT) await choose(c, SELECT[testId]);
      else if (name === "gradeLevel") await c.selectOption("S2");
      else if (name === "position") await c.selectOption("Mathematics teacher");
      else if (name === "yearsOfExperience") await c.selectOption("3");
      else if (/^Country/.test(label)) await choose(c, "Rwanda");
      else if (/^Home district/.test(label)) await choose(c, "Gasabo");
      else {
        await expect(c).toBeEnabled({ timeout: 30_000 });
        await expect(c.locator("option").nth(1)).toBeAttached({ timeout: 30_000 });
        await c.selectOption({ index: 1 });
      }
    } else if (type === "radio") {
      // Gender (required): Female, once per group.
      if ((await step.locator(`input[type=radio][name="${name}"]:checked`).count()) === 0) {
        await step.locator(`input[type=radio][name="${name}"]`).first().check();
        changed = true;
      }
    } else if (type === "checkbox") {
      if ((await step.locator(`input[type=checkbox][name="${name}"]:checked`).count()) === 0) {
        await c.check();
        changed = true;
      }
    } else if (name in TEXT && !(await c.isDisabled()) && !(await c.inputValue())) {
      await c.fill(TEXT[name]);
      changed = true;
    }
  }
  return changed;
}

/** A searchable country list (app/components/ui/SearchableSelect): type the name, then choose it. */
export async function pickCountry(page: Page, testId: string, name: string) {
  const box = page.getByTestId(testId);
  await box.click();
  await box.fill(name);
  await page.getByTestId(`${testId}-options`).getByRole("option", { name, exact: true }).click();
  await expect(box).toHaveValue(name);
}
