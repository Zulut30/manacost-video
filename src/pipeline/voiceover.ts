import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ELEVENLABS_MODEL_ID } from "./constants";
import { ensureDir, toPublicPath } from "./fs";
import { runPublicDir } from "./manifest";
import { captionsFromText } from "./subtitles";
import type { PipelineManifest } from "./types";
import { mediaDurationSeconds } from "./audio";

type ElevenVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
};

type ElevenVoicesResponse = {
  voices?: ElevenVoice[];
};

type VoiceoverOptions = {
  force?: boolean;
};

const voiceSettings = {
  stability: 0.5,
  similarityBoost: 0.78,
  style: 0.2,
};

export const generateVoiceover = async (
  manifest: PipelineManifest,
  options: VoiceoverOptions = {},
): Promise<PipelineManifest> => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      ...manifest,
      render: {
        warnings: [
          ...(manifest.render?.warnings || []),
          "ELEVENLABS_API_KEY is not set; voiceover was skipped.",
        ],
      },
    };
  }

  const voice = await chooseVoice(apiKey);
  const voiceoverDir = path.join(runPublicDir(manifest.slug), "voiceover");
  ensureDir(voiceoverDir);

  const scenes = [];
  for (const scene of manifest.scenes) {
    const outputPath = path.join(voiceoverDir, `${scene.id}.mp3`);
    if (options.force || !fs.existsSync(outputPath)) {
      await generateSceneAudio({
        apiKey,
        voiceId: voice.voice_id,
        text: scene.narration,
        outputPath,
      });
    }

    const durationSeconds = Math.max(8, mediaDurationSeconds(outputPath) + 0.4);
    scenes.push({
      ...scene,
      audioPath: toPublicPath(outputPath),
      durationSeconds,
      captions: captionsFromText(scene.narration, durationSeconds),
    });
  }

  return {
    ...manifest,
    scenes,
    voice: {
      provider: "elevenlabs",
      modelId: ELEVENLABS_MODEL_ID,
      voiceId: voice.voice_id,
      voiceName: voice.name,
      settings: voiceSettings,
    },
    updatedAt: new Date().toISOString(),
  };
};

const chooseVoice = async (apiKey: string): Promise<ElevenVoice> => {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs voices request failed: ${response.status}`);
  }

  const json = (await response.json()) as ElevenVoicesResponse;
  const voices = json.voices || [];
  if (voices.length === 0) {
    throw new Error("ElevenLabs account has no available voices.");
  }

  const requestedId = process.env.ELEVENLABS_VOICE_ID;
  if (requestedId) {
    return (
      voices.find((voice) => voice.voice_id === requestedId) || {
        voice_id: requestedId,
        name: requestedId,
      }
    );
  }

  const preferred = process.env.ELEVENLABS_PREFERRED_VOICE?.toLowerCase();
  if (preferred) {
    const byName = voices.find((voice) => voice.name.toLowerCase().includes(preferred));
    if (byName) {
      return byName;
    }
  }

  const allowLibraryVoices = process.env.ELEVENLABS_ALLOW_LIBRARY_VOICES === "true";
  const allowNonRussianVoice =
    process.env.ELEVENLABS_ALLOW_NON_RUSSIAN_VOICE === "true";
  const usableVoices = allowLibraryVoices
    ? voices
    : voices.filter((voice) => voice.category === "premade");
  const russianVoices = usableVoices.filter(isRussianVoice);

  if (russianVoices.length > 0) {
    return [...russianVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
  }

  if (!allowNonRussianVoice) {
    throw new Error(
      "ElevenLabs account has no API-usable Russian voice. Set ELEVENLABS_VOICE_ID to an available Russian voice, enable ELEVENLABS_ALLOW_LIBRARY_VOICES=true on a paid plan, or explicitly allow fallback with ELEVENLABS_ALLOW_NON_RUSSIAN_VOICE=true.",
    );
  }

  return [...(usableVoices.length > 0 ? usableVoices : voices)].sort(
    (a, b) => scoreVoice(b) - scoreVoice(a),
  )[0];
};

const isRussianVoice = (voice: ElevenVoice): boolean => {
  const labels = Object.values(voice.labels || {}).join(" ").toLowerCase();
  const name = voice.name.toLowerCase();
  return /russian|рус|ru\b|ru-|russia|moscow|petersburg/u.test(`${labels} ${name}`);
};

const scoreVoice = (voice: ElevenVoice): number => {
  const labels = Object.values(voice.labels || {}).join(" ").toLowerCase();
  const name = voice.name.toLowerCase();
  const profile = `${labels} ${name}`;
  let score = 0;

  if (isRussianVoice(voice)) {
    score += 40;
  }
  if (
    /multilingual|narration|narrative|news|story|informative|educational|professional|broadcaster|formal|calm/u.test(
      profile,
    )
  ) {
    score += 18;
  }
  if (/male|муж/u.test(labels)) {
    score += 10;
  }
  if (/daniel|george|brian|eric|adam|alex/u.test(name)) {
    score += 8;
  }
  if (voice.category === "premade") {
    score += 12;
  }
  if (voice.category === "professional") {
    score -= 35;
  }

  return score;
};

const generateSceneAudio = async (params: {
  apiKey: string;
  voiceId: string;
  text: string;
  outputPath: string;
}): Promise<void> => {
  ensureDir(path.dirname(params.outputPath));
  const rawPath = params.outputPath.replace(/\.mp3$/u, ".raw.mp3");
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": params.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: params.text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: voiceSettings.stability,
          similarity_boost: voiceSettings.similarityBoost,
          style: voiceSettings.style,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${body.slice(0, 300)}`);
  }

  fs.writeFileSync(rawPath, Buffer.from(await response.arrayBuffer()));

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        rawPath,
        "-af",
        "loudnorm=I=-16:LRA=11:TP=-1.5",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "3",
        params.outputPath,
      ],
      { stdio: "ignore" },
    );
    fs.rmSync(rawPath, { force: true });
  } catch {
    fs.renameSync(rawPath, params.outputPath);
  }
};
