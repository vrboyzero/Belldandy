import * as fs from "node:fs";
import type { AgentContentPart } from "./index.js";
import type { ModelProfile } from "./failover-client.js";

/**
 * Shared helper: build a versioned API URL from a base URL + endpoint.
 * If baseUrl already ends with /v1, /v4, etc., it is used as-is.
 * Otherwise /v1 is appended.
 */
export function buildUrl(baseUrl: string, endpoint: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const base = /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
  return `${base}${endpoint}`;
}

/**
 * Upload a local file to the Moonshot /files endpoint.
 * Uses Node.js 22 native FormData + Blob (no npm form-data dependency).
 *
 * @returns The file ID from the Moonshot API response.
 */
export async function uploadFileToMoonshot(
  filePath: string,
  apiKey: string,
  baseUrl: string,
  purpose: string = "file-extract",
): Promise<string> {
  const stats = fs.statSync(filePath);
  if (stats.size > 100 * 1024 * 1024) {
    throw new Error("Video file too large (>100MB)");
  }

  const buffer = fs.readFileSync(filePath);
  const fileName = filePath.split(/[\\/]/).pop() ?? "video.mp4";

  // Use native FormData + Blob (Node.js 18+)
  const blob = new Blob([buffer]);
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("purpose", purpose);

  const url = buildUrl(baseUrl, "/files");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      // Do NOT set Content-Type manually — native fetch sets it
      // automatically with the correct multipart boundary.
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { id: string };
  return json.id;
}

export type PreprocessResult = {
  /** The transformed content (local file:// video_url replaced with ms:// video_url) */
  content: string | Array<AgentContentPart>;
  /** Whether any video was uploaded (for status reporting) */
  hadVideoUpload: boolean;
};

/** Optional override for video file upload endpoint (when chat proxy ≠ file upload API). */
export type VideoUploadConfig = {
  apiUrl: string;
  apiKey: string;
};

/**
 * Preprocess multimodal content: detect video_url parts with file:// paths,
 * upload them to Moonshot, and replace with video_file parts.
 *
 * This is a plain async function (not a generator). The caller is responsible
 * for yielding status events (e.g., "uploading_video") before/after calling.
 *
 * @param uploadOverride  If provided, video uploads use this URL/key instead of
 *                        the chat profile's baseUrl/apiKey. Useful when the chat
 *                        endpoint is a proxy that doesn't support /files.
 */
export async function preprocessMultimodalContent(
  content: string | Array<AgentContentPart>,
  profile: ModelProfile,
  uploadOverride?: VideoUploadConfig,
): Promise<PreprocessResult> {
  if (typeof content === "string") {
    return { content, hadVideoUpload: false };
  }

  const uploadApiKey = uploadOverride?.apiKey ?? profile.apiKey;
  const uploadBaseUrl = uploadOverride?.apiUrl ?? profile.baseUrl;

  let hadVideoUpload = false;
  const newContent: Array<any> = [];

  for (const part of content) {
    if (part.type === "video_url" && (part as any).video_url?.url?.startsWith("file://")) {
      const filePath = (part as any).video_url.url.replace("file://", "");
      try {
        const fileId = await uploadFileToMoonshot(
          filePath,
          uploadApiKey,
          uploadBaseUrl,
          "video",
        );
        newContent.push({
          type: "video_url",
          video_url: { url: `ms://${fileId}` },
        });
        hadVideoUpload = true;
      } catch (e) {
        console.error("Failed to upload video:", e);
        newContent.push({ type: "text", text: `[Video: ${filePath} (Upload Failed: ${e instanceof Error ? e.message : String(e)})]` });
      }
    } else {
      newContent.push(part);
    }
  }

  return { content: newContent, hadVideoUpload };
}
