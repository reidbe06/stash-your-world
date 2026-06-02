import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTranscript } from "./transcript.server";

const inputSchema = z.object({
  url: z.string().url().max(2000),
  platform: z.string().max(50).default("instagram_reel"),
});

export type SocialCaptionResult = {
  caption: string | null;
  method: string | null;
  uploader: string | null;
  thumbnail: string | null;
  tags: string[];
};

export const fetchSocialCaption = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<SocialCaptionResult> => {
    console.log(`[social-caption] Fetching caption: platform=${data.platform} url=${data.url}`);
    const result = await fetchTranscript(data.url, data.platform);
    const caption = result?.text ?? null;
    console.log(
      `[social-caption] Result: method=${result?.method ?? "none"} caption_len=${caption?.length ?? 0}`,
    );
    return {
      caption,
      method: result?.method ?? null,
      uploader: result?.ytdlp?.uploader ?? null,
      thumbnail: result?.ytdlp?.thumbnail ?? null,
      tags: result?.ytdlp?.tags ?? [],
    };
  });
