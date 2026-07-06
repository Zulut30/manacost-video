import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ELEVENLABS_MODEL_ID } from "./constants";
import { mediaDurationSeconds } from "./audio";
import { buildSceneFocusCues } from "./focus";
import { ensureDir, toPublicPath } from "./fs";
import { runPublicDir } from "./manifest";
import {
  captionsFromCharacterAlignment,
  captionsFromText,
  type CharacterAlignment,
} from "./subtitles";
import { cleanText } from "./text";
import type { PipelineManifest } from "./types";

type ElevenVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
};

type ElevenVoicesResponse = {
  voices?: ElevenVoice[];
};

type ElevenLabsTimingResponse = {
  audio_base64: string;
  alignment?: CharacterAlignment;
  normalized_alignment?: CharacterAlignment;
};

type VoiceoverOptions = {
  force?: boolean;
};

type VoiceoverMetadata = {
  hash: string;
  provider: "elevenlabs" | "edge-tts";
  voiceId: string;
  voiceName: string;
  modelId: string;
  textChars: number;
  ttsTextChars?: number;
  alignmentPath?: string;
  durationSeconds?: number;
  generatedAt: string;
};

const envNumber = (name: string, fallback: number): number => {
  const value = Number.parseFloat(process.env[name] || "");
  return Number.isFinite(value) ? value : fallback;
};

const voiceSettings = {
  stability: envNumber("ELEVENLABS_STABILITY", 0.56),
  similarityBoost: envNumber("ELEVENLABS_SIMILARITY_BOOST", 0.78),
  style: envNumber("ELEVENLABS_STYLE", 0.16),
  speed: Math.min(1.12, Math.max(0.88, envNumber("ELEVENLABS_SPEED", 1))),
};

const edgeTtsModelId = "msedge-tts-v2-rate-plus22";
const edgeTtsVoiceId = process.env.EDGE_TTS_VOICE || "ru-RU-DmitryNeural";
const edgeTtsVoiceName = process.env.EDGE_TTS_VOICE_NAME || "Dmitry Neural";

export const prepareNarrationForTts = (text: string): string => {
  return cleanText(text)
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/[\u2013\u2014]+/gu, " - ")
    .replace(/\s*\/\s*/gu, " или ")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/([,.!?;:])(?=\S)/gu, "$1 ")
    .replace(/\s{2,}/gu, " ")
    .trim();
};

export const generateVoiceover = async (
  manifest: PipelineManifest,
  options: VoiceoverOptions = {},
): Promise<PipelineManifest> => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const preferredProvider = process.env.TTS_PROVIDER?.toLowerCase();

  if (!apiKey || preferredProvider === "edge-tts") {
    const warnings = apiKey
      ? []
      : ["ELEVENLABS_API_KEY is not set; using Edge TTS fallback voiceover."];
    if (preferredProvider === "elevenlabs" && !apiKey) {
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

    return generateEdgeVoiceover(manifest, options, warnings);
  }

  return generateElevenLabsVoiceover(manifest, apiKey, options);
};

const generateElevenLabsVoiceover = async (
  manifest: PipelineManifest,
  apiKey: string,
  options: VoiceoverOptions = {},
): Promise<PipelineManifest> => {
  let voice = await chooseVoice(apiKey);
  let usedFallbackVoice = false;
  const warnings: string[] = [];

  while (true) {
    try {
      return await generateElevenLabsVoiceoverWithVoice(
        manifest,
        apiKey,
        voice,
        options,
        warnings,
      );
    } catch (error) {
      if (!usedFallbackVoice && isPaidPlanVoiceError(error)) {
        const fallbackVoice = await chooseFallbackPremadeVoice(apiKey, voice.voice_id);
        warnings.push(
          `ElevenLabs voice ${voice.name} requires a paid API plan; using ${fallbackVoice.name} instead.`,
        );
        voice = fallbackVoice;
        usedFallbackVoice = true;
        continue;
      }
      throw error;
    }
  }
};

const generateElevenLabsVoiceoverWithVoice = async (
  manifest: PipelineManifest,
  apiKey: string,
  voice: ElevenVoice,
  options: VoiceoverOptions = {},
  warnings: string[] = [],
): Promise<PipelineManifest> => {
  const voiceoverDir = path.join(runPublicDir(manifest.slug), "voiceover");
  ensureDir(voiceoverDir);

  const scenes = [];
  for (const scene of manifest.scenes) {
    const outputPath = path.join(voiceoverDir, `${scene.id}.mp3`);
    const metadataPath = path.join(voiceoverDir, `${scene.id}.voice.json`);
    const alignmentPath = path.join(voiceoverDir, `${scene.id}.alignment.json`);
    const ttsText = prepareNarrationForTts(scene.narration);
    const audioHash = voiceoverHash({
      text: ttsText,
      voiceId: voice.voice_id,
      modelId: ELEVENLABS_MODEL_ID,
    });
    const metadata = readVoiceoverMetadata(metadataPath);
    const needsRegeneration =
      options.force ||
      !fs.existsSync(outputPath) ||
      !fs.existsSync(alignmentPath) ||
      metadata?.provider !== "elevenlabs" ||
      metadata?.hash !== audioHash ||
      metadata?.voiceId !== voice.voice_id ||
      metadata?.modelId !== ELEVENLABS_MODEL_ID;

    let alignment = readCharacterAlignment(alignmentPath);
    if (needsRegeneration) {
      alignment = await generateSceneAudioWithTiming({
        apiKey,
        voiceId: voice.voice_id,
        text: ttsText,
        outputPath,
        alignmentPath,
      });
      const generatedDurationSeconds = mediaDurationSeconds(outputPath);
      writeVoiceoverMetadata(metadataPath, {
        hash: audioHash,
        provider: "elevenlabs",
        voiceId: voice.voice_id,
        voiceName: voice.name,
        modelId: ELEVENLABS_MODEL_ID,
        textChars: scene.narration.length,
        ttsTextChars: ttsText.length,
        alignmentPath: toPublicPath(alignmentPath),
        durationSeconds: generatedDurationSeconds,
        generatedAt: new Date().toISOString(),
      });
    }

    const durationSeconds = Math.max(8, mediaDurationSeconds(outputPath) + 0.8);
    const captions = captionsFromCharacterAlignment(
      alignment,
      scene.narration,
      durationSeconds,
    );
    const nextScene = {
      ...scene,
      audioPath: toPublicPath(outputPath),
      audioHash,
      durationSeconds,
      captions,
    };
    scenes.push({
      ...nextScene,
      focusCues: buildSceneFocusCues(nextScene, manifest.assets),
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
    render: {
      ...(manifest.render || {}),
      warnings: [...(manifest.render?.warnings || []), ...warnings],
    },
    updatedAt: new Date().toISOString(),
  };
};

const generateEdgeVoiceover = async (
  manifest: PipelineManifest,
  options: VoiceoverOptions = {},
  warnings: string[] = [],
): Promise<PipelineManifest> => {
  const voiceoverDir = path.join(runPublicDir(manifest.slug), "voiceover");
  ensureDir(voiceoverDir);

  const scenes = [];
  for (const scene of manifest.scenes) {
    const outputPath = path.join(voiceoverDir, `${scene.id}.mp3`);
    const metadataPath = path.join(voiceoverDir, `${scene.id}.voice.json`);
    const ttsText = prepareNarrationForTts(scene.narration);
    const audioHash = voiceoverHash({
      text: ttsText,
      voiceId: edgeTtsVoiceId,
      modelId: edgeTtsModelId,
    });
    const metadata = readVoiceoverMetadata(metadataPath);
    const needsRegeneration =
      options.force ||
      !fs.existsSync(outputPath) ||
      metadata?.provider !== "edge-tts" ||
      metadata?.hash !== audioHash ||
      metadata?.voiceId !== edgeTtsVoiceId ||
      metadata?.modelId !== edgeTtsModelId;

    if (needsRegeneration) {
      await generateEdgeSceneAudio({
        text: ttsText,
        outputPath,
      });
      const generatedDurationSeconds = mediaDurationSeconds(outputPath);
      writeVoiceoverMetadata(metadataPath, {
        hash: audioHash,
        provider: "edge-tts",
        voiceId: edgeTtsVoiceId,
        voiceName: edgeTtsVoiceName,
        modelId: edgeTtsModelId,
        textChars: scene.narration.length,
        ttsTextChars: ttsText.length,
        durationSeconds: generatedDurationSeconds,
        generatedAt: new Date().toISOString(),
      });
    }

    const durationSeconds = Math.max(8, mediaDurationSeconds(outputPath) + 0.8);
    const nextScene = {
      ...scene,
      audioPath: toPublicPath(outputPath),
      audioHash,
      durationSeconds,
      captions: captionsFromText(scene.narration, durationSeconds),
    };
    scenes.push({
      ...nextScene,
      focusCues: buildSceneFocusCues(nextScene, manifest.assets),
    });
  }

  return {
    ...manifest,
    scenes,
    voice: {
      provider: "edge-tts",
      modelId: edgeTtsModelId,
      voiceId: edgeTtsVoiceId,
      voiceName: edgeTtsVoiceName,
      settings: {
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.25,
        speed: 1.22,
      },
    },
    render: {
      warnings: [...(manifest.render?.warnings || []), ...warnings],
    },
    updatedAt: new Date().toISOString(),
  };
};

export const voiceoverHash = (params: {
  text: string;
  voiceId?: string;
  modelId?: string;
}): string => {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        text: params.text,
        voiceId: params.voiceId || "",
        modelId: params.modelId || ELEVENLABS_MODEL_ID,
        settings: voiceSettings,
      }),
    )
    .digest("hex");
};

const readVoiceoverMetadata = (metadataPath: string): VoiceoverMetadata | undefined => {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as VoiceoverMetadata;
  } catch {
    return undefined;
  }
};

const writeVoiceoverMetadata = (
  metadataPath: string,
  metadata: VoiceoverMetadata,
): void => {
  ensureDir(path.dirname(metadataPath));
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
};

const readCharacterAlignment = (
  alignmentPath: string,
): CharacterAlignment | undefined => {
  try {
    const json = JSON.parse(fs.readFileSync(alignmentPath, "utf8")) as {
      alignment?: CharacterAlignment;
      normalized_alignment?: CharacterAlignment;
    };
    return json.normalized_alignment || json.alignment;
  } catch {
    return undefined;
  }
};

const writeCharacterAlignment = (
  alignmentPath: string,
  response: ElevenLabsTimingResponse,
): CharacterAlignment | undefined => {
  const alignment = response.normalized_alignment || response.alignment;
  ensureDir(path.dirname(alignmentPath));
  fs.writeFileSync(
    alignmentPath,
    `${JSON.stringify(
      {
        alignment: response.alignment,
        normalized_alignment: response.normalized_alignment,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return alignment;
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

const chooseFallbackPremadeVoice = async (
  apiKey: string,
  excludedVoiceId?: string,
): Promise<ElevenVoice> => {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs voices request failed: ${response.status}`);
  }

  const json = (await response.json()) as ElevenVoicesResponse;
  const voices = (json.voices || []).filter(
    (voice) => voice.category === "premade" && voice.voice_id !== excludedVoiceId,
  );

  if (voices.length === 0) {
    throw new Error("ElevenLabs account has no premade fallback voice for API TTS.");
  }

  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
};

const isPaidPlanVoiceError = (error: unknown): boolean => {
  return (
    error instanceof Error &&
    /paid_plan_required|paid plan|Free users cannot use library voices/iu.test(
      error.message,
    )
  );
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

const generateSceneAudioWithTiming = async (params: {
  apiKey: string;
  voiceId: string;
  text: string;
  outputPath: string;
  alignmentPath: string;
}): Promise<CharacterAlignment | undefined> => {
  ensureDir(path.dirname(params.outputPath));
  const rawPath = params.outputPath.replace(/\.mp3$/u, ".raw.mp3");
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": params.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: params.text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: voiceSettings.stability,
          similarity_boost: voiceSettings.similarityBoost,
          style: voiceSettings.style,
          speed: voiceSettings.speed,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as ElevenLabsTimingResponse;
  if (!json.audio_base64) {
    throw new Error("ElevenLabs TTS did not return audio_base64.");
  }

  fs.writeFileSync(rawPath, Buffer.from(json.audio_base64, "base64"));
  normalizeMp3(rawPath, params.outputPath);
  return writeCharacterAlignment(params.alignmentPath, json);
};

const generateEdgeSceneAudio = async (params: {
  text: string;
  outputPath: string;
}): Promise<void> => {
  ensureDir(path.dirname(params.outputPath));
  const tmpDir = params.outputPath.replace(/\.mp3$/u, ".edge-tmp");
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  fs.rmSync(tmpDir, { force: true, recursive: true });
  ensureDir(tmpDir);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(edgeTtsVoiceId, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
  const { audioFilePath } = await tts.toFile(tmpDir, params.text, {
    rate: "+22%",
    pitch: "-2Hz",
    volume: "+0%",
  });

  try {
    normalizeMp3(audioFilePath, params.outputPath);
  } finally {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  }
};

const normalizeMp3 = (rawPath: string, outputPath: string): void => {
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
        outputPath,
      ],
      { stdio: "ignore" },
    );
    fs.rmSync(rawPath, { force: true });
  } catch {
    fs.renameSync(rawPath, outputPath);
  }
};
