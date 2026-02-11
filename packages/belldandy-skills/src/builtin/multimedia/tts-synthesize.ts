import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import { EdgeTTS } from "node-edge-tts";

export type SynthesizeResult = {
  webPath: string;
  htmlAudio: string;
};

export type SynthesizeOptions = {
  text: string;
  stateDir: string;
  provider?: string;
  voice?: string;
  model?: string;
};

/**
 * Standalone TTS synthesis function (no Tool interface dependency).
 * Returns { webPath, htmlAudio } on success, null on failure.
 */
export async function synthesizeSpeech(opts: SynthesizeOptions): Promise<SynthesizeResult | null> {
  const { text, stateDir } = opts;
  if (!text?.trim()) return null;

  const envProvider = process.env.BELLDANDY_TTS_PROVIDER;
  const provider = opts.provider || envProvider || "edge";

  let voice = opts.voice;
  if (!voice) {
    const envVoice = process.env.BELLDANDY_TTS_VOICE;
    if (envVoice?.trim()) {
      voice = envVoice.trim();
    } else {
      voice = provider === "openai" ? "alloy" : "zh-CN-XiaoxiaoNeural";
    }
  }

  try {
    const generatedDir = path.join(stateDir, "generated");
    await fs.mkdir(generatedDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const isDs = provider === "dashscope";
    const filename = `speech-${timestamp}.${isDs ? "wav" : "mp3"}`;
    const filepath = path.join(generatedDir, filename);

    if (provider === "openai") {
      await synthesizeOpenAI(filepath, text, voice!, opts.model);
    } else if (provider === "dashscope") {
      await synthesizeDashScope(filepath, text, voice || "Cherry");
    } else {
      await synthesizeEdge(filepath, text, voice!);
    }

    const webPath = `/generated/${filename}`;
    const htmlAudio = `<audio controls autoplay src="${webPath}" preload="auto"></audio>`;
    return { webPath, htmlAudio };
  } catch (err) {
    console.error(`[TTS-Auto] synthesizeSpeech failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function synthesizeOpenAI(filepath: string, text: string, voice: string, model?: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  if (!apiKey) throw new Error("OPENAI_API_KEY required for OpenAI provider.");

  const openai = new OpenAI({ apiKey, baseURL });
  const mp3 = await openai.audio.speech.create({
    model: (model as any) || "tts-1",
    voice: voice as any,
    input: text,
  });
  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.writeFile(filepath, buffer);
}

async function synthesizeDashScope(filepath: string, text: string, voice: string): Promise<void> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY required for DashScope provider.");

  const endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen3-tts-flash",
          input: { text, voice },
          parameters: { format: "mp3" },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DashScope API failed (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const audioUrl =
        data?.output?.audio?.url ||
        data?.output?.choices?.[0]?.message?.content?.[0]?.audio;

      if (!audioUrl) {
        throw new Error(`DashScope response missing audio URL. keys: ${Object.keys(data?.output || {}).join(",")}`);
      }

      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error(`Failed to download audio (${audioRes.status})`);

      const buffer = Buffer.from(await audioRes.arrayBuffer());
      if (buffer.length < 100) throw new Error(`Audio too small (${buffer.length} bytes)`);

      await fs.writeFile(filepath, buffer);
      return; // success
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error && err.cause ? ` | cause: ${(err.cause as Error).message ?? err.cause}` : "";
      console.warn(`[TTS-Auto] DashScope attempt ${attempt}/${maxRetries} failed: ${msg}${cause}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, attempt === 1 ? 3000 : 8000));
      }
    }
  }
  throw new Error(`DashScope failed after ${maxRetries} attempts. Last: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function synthesizeEdge(filepath: string, text: string, voice: string): Promise<void> {
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const tts = new EdgeTTS({ voice });
      if (!text?.trim()) throw new Error("Input text is empty");
      await tts.ttsPromise(text, filepath);

      const stats = await fs.stat(filepath);
      if (stats.size === 0) throw new Error("Generated audio file is empty (0 bytes)");
      return; // success
    } catch (err) {
      lastError = err;
      console.warn(`[TTS-Auto] EdgeTTS attempt ${attempt}/${maxRetries} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw new Error(`EdgeTTS failed after ${maxRetries} attempts. Last: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
