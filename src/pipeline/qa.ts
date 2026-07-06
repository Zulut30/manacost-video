import fs from "node:fs";
import path from "node:path";
import { PUBLIC_DIR } from "./constants";
import { finalVideoPath } from "./manifest";
import { probeMedia } from "./audio";
import type { ContentCoverageReport, PipelineAsset, PipelineManifest } from "./types";
import { prepareNarrationForTts, voiceoverHash } from "./voiceover";

const parseRate = (rate?: string): number | undefined => {
  if (!rate) {
    return undefined;
  }
  const [num, den] = rate.split("/").map(Number);
  if (!num || !den) {
    return undefined;
  }
  return num / den;
};

const isCriticalWarning = (warning: string): boolean => {
  return /does not exist|Unexpected|shorter than target|longer than target|audio stream|video stream|voiceover was skipped|missing card assets|missing card scenes|stale voiceover|audio file missing|caption timing/iu.test(
    warning,
  );
};

const isQaGeneratedWarning = (warning: string): boolean => {
  return /Output file does not exist|Output has no video stream|Output has no audio stream|Unexpected resolution|Video is shorter than target|Video is longer than target|Unexpected FPS|Missing card scenes|Missing card assets|Stale voiceover hash|Audio file missing|Caption timing/iu.test(
    warning,
  );
};

export const qaVideo = (manifest: PipelineManifest): PipelineManifest => {
  const outputPath = manifest.render?.outputPath || finalVideoPath(manifest.slug);
  const warnings = (manifest.render?.warnings || []).filter(
    (warning) => !isQaGeneratedWarning(warning),
  );
  const coverage = cardCoverage(manifest);
  warnings.push(...coverageWarnings(coverage));
  warnings.push(...voiceoverWarnings(manifest));

  if (!fs.existsSync(outputPath)) {
    return {
      ...manifest,
      render: {
        ...manifest.render,
        outputPath,
        ok: false,
        coverage,
        warnings: [...warnings, `Output file does not exist: ${outputPath}`],
      },
    };
  }

  const probe = probeMedia(outputPath);
  const videoStream = probe.streams?.find((stream) => stream.width && stream.height);
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  const width = videoStream?.width;
  const height = videoStream?.height;
  const fps = parseRate(videoStream?.r_frame_rate);
  const durationSeconds = Number(probe.format?.duration || 0) || undefined;

  if (!videoStream) {
    warnings.push("Output has no video stream.");
  }
  if (!audioStream) {
    warnings.push("Output has no audio stream.");
  }
  if (width !== manifest.target.width || height !== manifest.target.height) {
    warnings.push(
      `Unexpected resolution: ${width}x${height}, expected ${manifest.target.width}x${manifest.target.height}`,
    );
  }
  if (durationSeconds && durationSeconds < manifest.target.minMinutes * 60) {
    warnings.push(`Video is shorter than target: ${durationSeconds.toFixed(1)}s`);
  }
  if (durationSeconds && durationSeconds > manifest.target.maxMinutes * 60 + 10) {
    warnings.push(`Video is longer than target: ${durationSeconds.toFixed(1)}s`);
  }
  if (fps && Math.abs(fps - manifest.target.fps) > 0.2) {
    warnings.push(`Unexpected FPS: ${fps.toFixed(2)}`);
  }

  return {
    ...manifest,
    render: {
      ...(manifest.render || {}),
      outputPath,
      durationSeconds,
      width,
      height,
      fps,
      coverage,
      ok: warnings.every((warning) => !isCriticalWarning(warning)),
      warnings,
    },
    updatedAt: new Date().toISOString(),
  };
};

const normalizeKey = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\u0451/gu, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
};

const cardKeys = (values: Array<string | undefined>): Set<string> => {
  return new Set(values.map((value) => normalizeKey(value || "")).filter(Boolean));
};

const assetKeys = (asset: PipelineAsset): Set<string> => {
  return cardKeys([asset.title, ...asset.tags]);
};

const cardCoverage = (manifest: PipelineManifest): ContentCoverageReport => {
  const mentions = manifest.article.cardMentions || [];
  const sceneKeys = cardKeys(
    manifest.scenes.flatMap((scene) => [
      ...(scene.cardIds || []),
      ...(scene.cardNames || []),
    ]),
  );
  const assetKeySets = manifest.assets
    .filter((asset) => asset.kind === "image" && asset.role === "card")
    .map(assetKeys);
  const assetCardKeys = new Set(assetKeySets.flatMap((keys) => [...keys]));
  const missingSceneCards: string[] = [];
  const missingAssetCards: string[] = [];

  for (const mention of mentions) {
    const mentionKeys = cardKeys([mention.cardId, mention.name, mention.id]);
    const inScene = [...mentionKeys].some((key) => sceneKeys.has(key));
    const inAssets = [...mentionKeys].some((key) => assetCardKeys.has(key));

    if (!inScene) {
      missingSceneCards.push(mention.name);
    }
    if (!inAssets) {
      missingAssetCards.push(mention.name);
    }
  }

  return {
    detectedCards: mentions.length,
    sceneCards: sceneKeys.size,
    assetCards: assetCardKeys.size,
    missingSceneCards,
    missingAssetCards,
  };
};

const coverageWarnings = (coverage: ContentCoverageReport): string[] => {
  const warnings: string[] = [];

  if (coverage.missingSceneCards.length > 0) {
    warnings.push(
      `Missing card scenes: ${coverage.missingSceneCards.slice(0, 8).join(", ")}`,
    );
  }
  if (coverage.missingAssetCards.length > 0) {
    warnings.push(
      `Missing card assets: ${coverage.missingAssetCards.slice(0, 8).join(", ")}`,
    );
  }

  return warnings;
};

const publicFilePath = (publicPath: string): string => {
  return path.join(PUBLIC_DIR, publicPath.replace(/\//gu, path.sep));
};

const spokenWordCount = (text: string): number => {
  return text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
};

const voiceoverWarnings = (manifest: PipelineManifest): string[] => {
  if (manifest.voice.provider === "none") {
    return [];
  }

  const warnings: string[] = [];
  for (const scene of manifest.scenes) {
    if (!scene.audioPath) {
      warnings.push(`Audio file missing for scene: ${scene.id}`);
      continue;
    }

    const ttsText = prepareNarrationForTts(scene.narration);
    const expectedHash = voiceoverHash({
      text: ttsText,
      voiceId: manifest.voice.voiceId,
      modelId: manifest.voice.modelId,
    });
    if (scene.audioHash !== expectedHash) {
      warnings.push(`Stale voiceover hash for scene: ${scene.id}`);
    }
    if (!fs.existsSync(publicFilePath(scene.audioPath))) {
      warnings.push(`Audio file missing on disk for scene: ${scene.id}`);
    }

    const durationMs = Math.round(scene.durationSeconds * 1000);
    const captions = scene.captions || [];
    if (captions.length === 0) {
      warnings.push(`Caption timing missing for scene: ${scene.id}`);
    } else {
      const firstCaption = captions[0];
      const lastCaption = captions[captions.length - 1];
      if (firstCaption.startMs > 300 || lastCaption.endMs > durationMs + 250) {
        warnings.push(`Caption timing outside scene bounds for scene: ${scene.id}`);
      }
      if (lastCaption.endMs < durationMs - 2500) {
        warnings.push(`Caption timing ends too early for scene: ${scene.id}`);
      }
      if (captions.some((caption) => caption.endMs - caption.startMs < 450)) {
        warnings.push(`Caption timing has unreadable short groups for scene: ${scene.id}`);
      }
    }

    const words = spokenWordCount(ttsText);
    if (scene.durationSeconds > 0 && words > 6) {
      const wordsPerMinute = words / (scene.durationSeconds / 60);
      if (wordsPerMinute < 90 || wordsPerMinute > 210) {
        warnings.push(
          `Speech pace outside target for scene ${scene.id}: ${wordsPerMinute.toFixed(0)} wpm`,
        );
      }
    }
  }

  return warnings;
};
