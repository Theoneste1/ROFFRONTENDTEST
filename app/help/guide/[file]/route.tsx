/**
 * GET /help/guide/<audience>.pdf — the downloadable guide of a role (owner, 2026-11-26), e.g. /help/guide/coaches.pdf.
 * Public: the guides hold no personal data and also help people who cannot sign in yet. Rendered on the server.
 */
import { renderGuide } from "@/lib/help/pdf-document";
import { guideFileName, roleFromGuideFile } from "@/lib/help/rules";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const role = roleFromGuideFile(file);
  if (!role) return new Response("This guide does not exist.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  try {
    const bytes = await renderGuide(role, new URL(request.url).origin);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${guideFileName(role)}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("The guide could not be prepared. Try again in a moment, or contact technical support on WhatsApp: 0780 850 611.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" },
    });
  }
}
