import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchMetadata, type UrlMetadata } from "./url-metadata.server";

export type { UrlMetadata };

export const fetchUrlMetadata = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ url: z.string().trim().min(1).max(2000).url() }).parse(input),
  )
  .handler(async ({ data }): Promise<UrlMetadata> => fetchMetadata(data.url));