import { graphed } from "../marketing/graphed";

// HeyGen Avatar IV through Graphed Tools, adapted from the Loman reference
// (agents/loman/src/fb/heygen-graphed.ts). Send script + look id; result is
// HeyGen status JSON with video_url. Never send video_inputs/dimension.

export const HEYGEN_AVATAR_IV = "heygen:videos.avatar_iv";

export interface HeygenVideoInput {
  script: string;
  avatarId: string;
  voiceId?: string;
  title?: string;
  aspectRatio?: "16:9" | "9:16" | "4:5" | "1:1";
  resolution?: "1080p" | "720p" | "4k";
  captionSrt?: boolean;
}

export interface HeygenVideoResult {
  videoId: string;
  videoUrl: string;
  subtitleUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function renderAvatarVideo(
  input: HeygenVideoInput,
  timeoutSeconds = 900,
): Promise<HeygenVideoResult> {
  const body: Record<string, unknown> = {
    script: input.script,
    avatarId: input.avatarId,
    aspectRatio: input.aspectRatio ?? "16:9",
    resolution: input.resolution ?? "1080p",
  };
  if (input.voiceId) body.voiceId = input.voiceId;
  if (input.title) body.title = input.title;
  if (input.captionSrt) body.caption = { file_format: "srt" };

  const raw = await graphed.tools.run(HEYGEN_AVATAR_IV, body, {
    timeoutSeconds,
    pollMs: 10_000,
  });
  const root = asRecord(raw) ?? {};
  const data = asRecord(root.data) ?? root;
  const videoUrl = String(data.video_url ?? data.videoUrl ?? "");
  if (!videoUrl) {
    throw new Error(
      `HeyGen result missing video_url: ${JSON.stringify(raw).slice(0, 400)}`,
    );
  }
  const duration = data.duration;
  return {
    videoId: String(data.video_id ?? data.videoId ?? data.id ?? ""),
    videoUrl,
    subtitleUrl:
      typeof data.subtitle_url === "string"
        ? data.subtitle_url
        : typeof data.subtitleUrl === "string"
          ? data.subtitleUrl
          : null,
    thumbnailUrl:
      typeof data.thumbnail_url === "string"
        ? data.thumbnail_url
        : typeof data.thumbnailUrl === "string"
          ? data.thumbnailUrl
          : null,
    durationSeconds: typeof duration === "number" ? duration : null,
  };
}
