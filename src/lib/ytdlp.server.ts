/**
 * ytdlp.server.ts
 *
 * Wrapper around the yt-dlp command-line tool.
 * Extracts metadata (title, description, creator, tags, thumbnail, subtitle URLs)
 * from video platform URLs without downloading the video file.
 *
 * Supported platforms (from server/datacenter IP):
 *   YouTube / Shorts  ✅  Full metadata + subtitle track URLs
 *   TikTok            ❌  Datacenter IP blocked — falls through gracefully
 *   Instagram         ❌  Requires login cookies — falls through gracefully
 *
 * Usage: fetchYtDlpData(url) → YtDlpData | null
 */

import { spawn } from "child_process";

const YTDLP_TIMEOUT_MS = 22_000;
const YTDLP_SOCKET_TIMEOUT = "15";

export type YtDlpSubTrack = { lang: string; ext: string; url: string };

export type YtDlpData = {
  title: string | null;
  description: string | null;
  uploader: string | null;
  tags: string[];
  thumbnail: string | null;
  extractorKey: string | null;
  subtitleTracks: YtDlpSubTrack[];   // manual/hardcoded subtitles
  autoCapTracks: YtDlpSubTrack[];    // auto-generated captions
};

const PREF_LANGS = ["en", "en-US", "en-GB", "en-CA", "en-AU"];

function pickSubTracks(
  subs: Record<string, { ext: string; url: string }[]> | undefined,
): YtDlpSubTrack[] {
  if (!subs) return [];
  for (const lang of PREF_LANGS) {
    if (subs[lang]?.length) {
      return subs[lang].map((t) => ({ lang, ext: t.ext, url: t.url }));
    }
  }
  return [];
}

/**
 * Run yt-dlp --dump-json --no-download on the given URL.
 * Returns structured metadata or null if yt-dlp fails or times out.
 */
export async function fetchYtDlpData(url: string): Promise<YtDlpData | null> {
  const t0 = Date.now();
  console.log(`[yt-dlp] START: ${url}`);

  return new Promise<YtDlpData | null>((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let settled = false;

    const done = (result: YtDlpData | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const proc = spawn("yt-dlp", [
      "--dump-json",
      "--no-download",
      "--no-playlist",
      "--socket-timeout", YTDLP_SOCKET_TIMEOUT,
      "--no-warnings",
      url,
    ]);

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      console.log(`[yt-dlp] TIMEOUT after ${Date.now() - t0}ms`);
      done(null);
    }, YTDLP_TIMEOUT_MS);

    proc.stdout.on("data", (chunk: Buffer) => { stdoutBuf += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });

    proc.on("error", (err) => {
      console.warn(`[yt-dlp] spawn error (${Date.now() - t0}ms):`, err);
      done(null);
    });

    proc.on("close", () => {
      const elapsed = Date.now() - t0;
      const jsonLine = stdoutBuf.trim().split("\n").find((l) => l.trimStart().startsWith("{"));
      if (!jsonLine) {
        const errPreview = stderrBuf.replace(/\n/g, " ").slice(0, 300);
        console.log(`[yt-dlp] No JSON output (${elapsed}ms). Reason: ${errPreview}`);
        return done(null);
      }

      try {
        const data: Record<string, unknown> = JSON.parse(jsonLine);

        const ytdlp: YtDlpData = {
          title: typeof data.title === "string" ? data.title.trim() || null : null,
          description: typeof data.description === "string" ? data.description.trim() || null : null,
          uploader:
            typeof data.uploader === "string" && data.uploader.trim()
              ? data.uploader.trim()
              : typeof data.channel === "string" && (data.channel as string).trim()
                ? (data.channel as string).trim()
                : null,
          tags: Array.isArray(data.tags)
            ? (data.tags as unknown[]).filter((t): t is string => typeof t === "string")
            : [],
          thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : null,
          extractorKey: typeof data.extractor_key === "string"
            ? (data.extractor_key as string).toLowerCase()
            : null,
          subtitleTracks: pickSubTracks(
            data.subtitles as Record<string, { ext: string; url: string }[]>,
          ),
          autoCapTracks: pickSubTracks(
            data.automatic_captions as Record<string, { ext: string; url: string }[]>,
          ),
        };

        console.log(
          `[yt-dlp] SUCCESS (${elapsed}ms): ` +
          `extractor=${ytdlp.extractorKey} ` +
          `title=${JSON.stringify(ytdlp.title?.slice(0, 60))} ` +
          `desc_len=${ytdlp.description?.length ?? 0} ` +
          `uploader=${JSON.stringify(ytdlp.uploader)} ` +
          `tags=${ytdlp.tags.length} ` +
          `sub_tracks=${ytdlp.subtitleTracks.length} ` +
          `auto_cap_tracks=${ytdlp.autoCapTracks.length}`,
        );

        done(ytdlp);
      } catch (err) {
        console.warn(`[yt-dlp] JSON parse error (${elapsed}ms):`, err);
        done(null);
      }
    });
  });
}

/**
 * Fetch the content of a subtitle track URL and return the plain text.
 * Handles json3 (YouTube's structured format) and plain text/vtt.
 */
export async function fetchSubtitleText(track: YtDlpSubTrack): Promise<string | null> {
  try {
    const res = await fetch(track.url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
    });
    if (!res.ok) return null;
    const raw = await res.text();

    if (track.ext === "json3") {
      try {
        const json = JSON.parse(raw);
        const parts: string[] = [];
        for (const ev of (json.events ?? []) as Array<{ segs?: Array<{ utf8?: string }> }>) {
          if (!ev.segs) continue;
          const line = ev.segs
            .map((s) => (s.utf8 ?? "").replace(/\n/g, " "))
            .join("")
            .trim();
          if (line && line !== "\n") parts.push(line);
        }
        const text = parts.join(" ").replace(/\s+/g, " ").trim();
        return text.length > 20 ? text : null;
      } catch { return null; }
    }

    // vtt / plain text — strip timestamps and tags
    const text = raw
      .replace(/WEBVTT[\s\S]*?\n\n/, "")
      .replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}.*$/gm, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 20 ? text : null;
  } catch {
    return null;
  }
}
