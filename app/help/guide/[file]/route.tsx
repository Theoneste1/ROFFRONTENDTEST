/**
 * GET /help/guide/<audience>.pdf — the downloadable guide of a role (owner, 2026-11-26), e.g. /help/guide/coaches.pdf;
 * /help/guide/every-role.pdf holds every role's chapter in one document (offered to Administrators).
 * Public: the guides hold no personal data and also help people who cannot sign in yet. Rendered on the server.
 */
import { EVERY_ROLE, renderGuide, type GuideScope } from "@/lib/help/pdf-document";
import { EVERY_ROLE_GUIDE, guideFileName, roleFromGuideFile } from "@/lib/help/rules";
import type { SupportInfo } from "@/lib/api/types";

export const runtime = "nodejs";

/** ROF's official support details (platform settings) for the guide; the guide is still made without them. */
async function officialSupport(origin: string): Promise<SupportInfo | null> {
  try {
    const res = await fetch(`${origin}/api/v1/support`, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
    return res.ok ? ((await res.json()) as SupportInfo) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const every = `/help/guide/${file}` === EVERY_ROLE_GUIDE.url;
  const role = every ? null : roleFromGuideFile(file);
  const scope: GuideScope | null = every ? EVERY_ROLE : role;
  if (!scope) return new Response("This guide does not exist.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  try {
    const origin = new URL(request.url).origin;
    const bytes = await renderGuide(scope, origin, new Date(), await officialSupport(origin));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${role ? guideFileName(role) : EVERY_ROLE_GUIDE.fileName}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("The guide could not be prepared. Try again in a moment, or read it inside ROF LMS (User guide in your profile menu).", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" },
    });
  }
}
