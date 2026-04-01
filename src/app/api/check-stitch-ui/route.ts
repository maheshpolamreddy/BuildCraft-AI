import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";

export const maxDuration = 180;

// Called by the client every few seconds to check whether Stitch has
// finished rendering the HTML for a given projectId.
export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const projectId = (parsed.body as Record<string, unknown>).projectId;

  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const stitchKey = process.env.STITCH_API_KEY?.trim();
  if (!stitchKey) {
    return NextResponse.json({ error: "STITCH_API_KEY not configured." }, { status: 503 });
  }

  try {
    const { StitchToolClient } = await import("@google/stitch-sdk");

    const isOAuth = stitchKey.startsWith("AQ.") || stitchKey.startsWith("ya29.");
    const cfg = isOAuth
      ? { accessToken: stitchKey, projectId: "stitch-buildcraft" }
      : { apiKey: stitchKey };

    const tc = new StitchToolClient(cfg);

    // List screens for this project
    type Screen = { name?: string; id?: string };
    const listRaw = await tc.callTool<{ screens?: Screen[] }>("list_screens", { projectId });
    const screens = listRaw.screens ?? [];

    for (const screen of screens) {
      const screenName = screen.name ?? "";
      const screenId   = screenName.includes("/screens/")
        ? screenName.split("/screens/")[1]
        : (screen.id ?? screenName);

      if (!screenId) continue;

      type GetResult = {
        htmlCode?:   { downloadUrl?: string };
        screenshot?: { downloadUrl?: string };
      };

      const screenRaw = await tc.callTool<GetResult>("get_screen", {
        projectId,
        screenId,
        name: `projects/${projectId}/screens/${screenId}`,
      });

      const htmlUrl = screenRaw.htmlCode?.downloadUrl;

      if (htmlUrl) {
        const htmlRes = await fetch(htmlUrl);
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          await tc.close().catch(() => {});
          return NextResponse.json({ ready: true, html });
        }
      }
    }

    await tc.close().catch(() => {});

    // Screen not ready yet — client should poll again
    return NextResponse.json({ ready: false, screenCount: screens.length });
  } catch (err) {
    console.error("[check-stitch-ui]", err);
    return NextResponse.json(
      { ready: false, error: `${err instanceof Error ? err.message : String(err)}` },
      { status: 200 } // still 200 so client keeps polling
    );
  }
}
