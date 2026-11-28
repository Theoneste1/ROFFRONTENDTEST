/**
 * The downloadable guide (owner, 2026-11-26): one PDF per role, in the website's fonts (Newsreader titles, Plus Jakarta Sans
 * text) and colours (logo blue #00428C, amber accent). Part 1 starts from opening the website and signing in; Part 2
 * explains every page of the portal in menu order. Rendered on the server (app/help/guide/[file]/route.tsx): the
 * site's Content-Security-Policy rightly forbids the WebAssembly the PDF layout engine needs in the browser.
 */
import { Document, Font, Image, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { ALL_HELP_ROLES, HELP_CREDIT, SUPPORT_PAGE, guideFor, whatsappUrl, type HelpRole, type HelpTopic } from "./rules";
import type { SupportInfo } from "../api/types";
import { SITE_URL } from "./content-shared";

const C = { brand: "#00428c", brand950: "#001d3d", brand50: "#eef4fb", brand100: "#d9e6f4", amber: "#fcd34d", ink: "#0f172a", muted: "#475569", line: "#cbd5e1" };

let fontsReady = false;
function registerFonts(origin: string) {
  if (fontsReady) return;
  Font.register({ family: "Jakarta", fonts: [
    { src: `${origin}/fonts/PlusJakartaSans-400.ttf`, fontWeight: 400 },
    { src: `${origin}/fonts/PlusJakartaSans-600.ttf`, fontWeight: 600 },
    { src: `${origin}/fonts/PlusJakartaSans-700.ttf`, fontWeight: 700 },
  ] });
  Font.register({ family: "Newsreader", fonts: [
    { src: `${origin}/fonts/Newsreader-500.ttf`, fontWeight: 500 },
    { src: `${origin}/fonts/Newsreader-600.ttf`, fontWeight: 600 },
  ] });
  Font.registerHyphenationCallback((word) => [word]);   // never split words
  fontsReady = true;
}

const s = StyleSheet.create({
  page: { fontFamily: "Jakarta", fontSize: 10.5, color: C.ink, paddingTop: 54, paddingBottom: 64, paddingHorizontal: 48, lineHeight: 1.5 },
  header: { position: "absolute", top: 22, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: C.muted, borderBottomWidth: 0.6, borderBottomColor: C.line, paddingBottom: 6 },
  footRule: { position: "absolute", bottom: 40, left: 48, right: 48, height: 0.6, backgroundColor: C.line },
  footLeft: { position: "absolute", bottom: 24, left: 48, fontSize: 8, color: C.muted },
  credit: { fontFamily: "Newsreader", fontWeight: 600, fontSize: 9.5, color: C.brand950 },
  part: { fontSize: 8, fontWeight: 700, letterSpacing: 1.2, color: C.brand, textTransform: "uppercase", marginBottom: 4 },
  partTitle: { fontFamily: "Newsreader", fontWeight: 600, fontSize: 24, lineHeight: 1.15, color: C.brand950, marginBottom: 8 },
  partIntro: { color: C.muted, marginBottom: 18 },
  topic: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 0.6, borderBottomColor: C.brand100 },
  topicTitle: { fontFamily: "Newsreader", fontWeight: 600, fontSize: 15.5, lineHeight: 1.2, color: C.brand950, marginBottom: 4 },
  label: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1, color: C.brand, textTransform: "uppercase", marginTop: 8, marginBottom: 4 },
  step: { flexDirection: "row", marginBottom: 4 },
  num: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginRight: 8, marginTop: 0.5 },
  numText: { color: "#ffffff", fontSize: 8, fontWeight: 700, lineHeight: 1 },
  stepText: { flex: 1 },
  tip: { flexDirection: "row", marginBottom: 3, color: C.muted },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.amber, marginTop: 5, marginRight: 7 },
  box: { backgroundColor: C.brand50, borderWidth: 0.8, borderColor: C.brand100, borderRadius: 8, padding: 14 },
  link: { color: C.brand, textDecoration: "none", fontWeight: 600 },
});

function Topic({ topic }: { topic: HelpTopic }) {
  return (
    <View style={s.topic} wrap={false} minPresenceAhead={80}>
      <Text style={s.topicTitle}>{topic.title}</Text>
      <Text>{topic.summary}</Text>
      {topic.steps && topic.steps.length > 0 && (
        <View>
          <Text style={s.label}>Steps</Text>
          {topic.steps.map((step, i) => (
            <View key={i} style={s.step}><View style={s.num}><Text style={s.numText}>{String(i + 1)}</Text></View><Text style={s.stepText}>{step}</Text></View>
          ))}
        </View>
      )}
      {topic.tips && topic.tips.length > 0 && (
        <View>
          <Text style={s.label}>Good to know</Text>
          {topic.tips.map((tip, i) => (
            <View key={i} style={s.tip}><View style={s.dot} /><Text style={s.stepText}>{tip}</Text></View>
          ))}
        </View>
      )}
    </View>
  );
}

function Frame({ audience }: { audience: string }) {
  return (
    <>
      <View style={s.header} fixed><Text>{`ROF LMS · Guide for ${audience}`}</Text><Text>{SITE_URL.replace("https://", "")}</Text></View>
      {/* Footer as separately positioned pieces: a row-laid-out fixed View is dropped by the PDF renderer (react-pdf 4.3). */}
      <View fixed style={s.footRule} />
      <Text fixed style={s.footLeft}>
        <Text style={s.credit}>{HELP_CREDIT}</Text>
        {`   ·   Support: ${SUPPORT_URL.replace("https://", "")}`}
      </Text>
    </>
  );
}

/** The combined guide for administrators: every role's chapter in one document. */
export const EVERY_ROLE = "EVERY_ROLE" as const;
export type GuideScope = HelpRole | typeof EVERY_ROLE;

/** Where every role finds ROF's official support details (the Help and Support page). */
const SUPPORT_URL = `${SITE_URL}${SUPPORT_PAGE}`;

/**
 * ROF support at the end of the guide: the official details from the platform settings (GET /support, the same as the
 * Help and Support page) — never a personal name or number (owner, 2026-11-28) — and the Help and Support page.
 */
function SupportBox({ support }: { support: SupportInfo | null }) {
  const wa = whatsappUrl(support?.phone);
  return (
    <View style={[s.box, { marginTop: 6 }]} wrap={false}>
      <Text style={[s.topicTitle, { marginBottom: 4 }]}>ROF support</Text>
      <Text>Something not working, or a question this guide does not answer? Contact ROF support.</Text>
      {support?.email ? <Text style={{ marginTop: 6 }}>{"E-mail: "}<Text style={{ fontWeight: 700 }}>{support.email}</Text></Text> : null}
      {support?.phone ? (
        <Text style={{ marginTop: 4 }}>
          {"Phone: "}<Text style={{ fontWeight: 700 }}>{support.phone}</Text>
          {wa ? <>{"   ·   "}<Link src={wa} style={s.link}>Ask on WhatsApp</Link></> : null}
        </Text>
      ) : null}
      {support?.hours ? <Text style={{ marginTop: 4 }}>{`Hours: ${support.hours}`}</Text> : null}
      <Text style={{ marginTop: 6 }}>{"All support details: "}<Link src={SUPPORT_URL} style={s.link}>{SUPPORT_URL.replace("https://", "")}</Link></Text>
      <Text style={{ marginTop: 4, color: C.muted, fontSize: 9 }}>Say which page you are on and what you tried. Never send your password.</Text>
    </View>
  );
}

export function GuideDocument({ scope, origin, date, support = null }: { scope: GuideScope; origin: string; date: Date; support?: SupportInfo | null }) {
  const every = scope === EVERY_ROLE;
  const roles: readonly HelpRole[] = scope === EVERY_ROLE ? ALL_HELP_ROLES : [scope];
  const audience = scope === EVERY_ROLE ? "every role" : guideFor(scope).audience;
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <Document title={`ROF LMS guide for ${audience}`} author={HELP_CREDIT} subject="How to use ROF LMS" creator="ROF LMS">
      {/* Cover */}
      <Page size="A4" style={{ fontFamily: "Jakarta", backgroundColor: C.brand950, color: "#ffffff", padding: 56 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- a react-pdf Image (no alt attribute in a PDF) */}
          <Image src={`${origin}/logo.png`} style={{ width: 64, height: 64, borderRadius: 32 }} />
          <View style={{ marginLeft: 14 }}>
            <Text style={{ fontFamily: "Newsreader", fontWeight: 500, fontSize: 22 }}>ROF LMS</Text>
            <Text style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.4, color: "#c7d7ea" }}>RWANDA OLYMPIAD FOUNDATION</Text>
          </View>
        </View>
        <View style={{ marginTop: 190 }}>
          <View style={{ width: 48, height: 4, backgroundColor: C.amber, marginBottom: 18 }} />
          <Text style={{ fontFamily: "Newsreader", fontWeight: 600, fontSize: 40, lineHeight: 1.1 }}>{`Guide for ${audience}`}</Text>
          <Text style={{ fontSize: 13, color: "#dbe7f5", marginTop: 14, lineHeight: 1.5 }}>
            {every
              ? `What every person on ROF LMS can do, role by role: ${roles.map((r) => guideFor(r).audience).join(", ")}. From opening the website and signing in, to every page of each portal.`
              : "How to use ROF LMS, step by step: from opening the website and signing in, to every page of your portal."}
          </Text>
          <Text style={{ fontSize: 10, color: "#c7d7ea", marginTop: 24 }}>{`Version of ${day}`}</Text>
        </View>
        <View style={{ position: "absolute", left: 56, right: 56, bottom: 56, borderTopWidth: 0.8, borderTopColor: "#33507a", paddingTop: 14, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 9.5, color: "#dbe7f5" }}>{`Support: ${SUPPORT_URL.replace("https://", "")}`}</Text>
          <Text style={{ fontFamily: "Newsreader", fontWeight: 600, fontSize: 11 }}>{HELP_CREDIT}</Text>
        </View>
      </Page>

      {/* Part 1: from signing in (the same for every role) */}
      <Page size="A4" style={s.page}>
        <Frame audience={audience} />
        <Text style={s.part}>Part 1</Text>
        <Text style={s.partTitle}>Getting started</Text>
        <Text style={s.partIntro}>{every ? "The same for everyone: from opening the website to the first page after signing in." : "From opening the website to your first page after signing in."}</Text>
        {guideFor(roles[0]).gettingStarted.map((topic) => <Topic key={topic.id} topic={topic} />)}
      </Page>

      {/* Then every page: one part per role */}
      {roles.map((role, n) => {
        const guide = guideFor(role);
        return (
          <Page key={role} size="A4" style={s.page}>
            <Frame audience={audience} />
            <Text style={s.part}>{`Part ${n + 2}`}</Text>
            <Text style={s.partTitle}>{every ? `Guide for ${guide.audience}` : "Inside ROF LMS"}</Text>
            <Text style={s.partIntro}>
              {every
                ? `Every page ${guide.audience.toLowerCase()} use, in the order of their menu, and what they can do there.`
                : "Every page of your portal, in the order of the menu. Inside the website, the Help button at the top right shows the part for the page you are on."}
            </Text>
            {guide.topics.map((topic) => <Topic key={topic.id} topic={topic} />)}
            {n === roles.length - 1 && <SupportBox support={support} />}
          </Page>
        );
      })}
    </Document>
  );
}

/** A guide as PDF bytes: one role's, or every role's. `origin`: where the fonts (/fonts/*.ttf) and the logo are served. */
export async function renderGuide(scope: GuideScope, origin: string, date = new Date(), support: SupportInfo | null = null): Promise<Buffer> {
  registerFonts(origin);
  return renderToBuffer(<GuideDocument scope={scope} origin={origin} date={date} support={support} />);
}
