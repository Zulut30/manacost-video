import type { Caption } from "@remotion/captions";
import type { PipelineAsset, SceneFocusCue, VideoScene } from "./types";

export const buildSceneFocusCues = (
  scene: VideoScene,
  manifestAssets: PipelineAsset[],
): SceneFocusCue[] => {
  const sceneAssets = scene.assetIds
    .map((id) => manifestAssets.find((asset) => asset.id === id))
    .filter((asset): asset is PipelineAsset => Boolean(asset))
    .filter((asset) => asset.kind === "image" && asset.role !== "background");

  if (sceneAssets.length === 0) {
    return [];
  }

  const matched = matchAssetCues(sceneAssets, scene.captions);
  if (matched.length >= Math.min(2, sceneAssets.length)) {
    return normalizeCueOrder(matched, scene.durationSeconds);
  }

  return distributeAssetCues(sceneAssets, scene.durationSeconds);
};

const matchAssetCues = (
  assets: PipelineAsset[],
  captions: Caption[],
): SceneFocusCue[] => {
  const cues: SceneFocusCue[] = [];
  const used = new Set<string>();
  const captionWindows = captions.map((caption, index) => ({
    startMs: caption.startMs,
    endMs: captions[index + 1]?.endMs || caption.endMs,
    text: normalizeKey(
      [caption.text, captions[index + 1]?.text || ""].filter(Boolean).join(" "),
    ),
  }));

  for (const asset of assets) {
    const keys = focusKeys(asset);
    if (keys.length === 0 || used.has(asset.id)) {
      continue;
    }

    const window = captionWindows.find((item) =>
      keys.some((key) => item.text.includes(key)),
    );
    if (!window) {
      continue;
    }

    cues.push({
      assetId: asset.id,
      label: asset.title,
      startMs: window.startMs,
      endMs: Math.max(window.endMs, window.startMs + 900),
    });
    used.add(asset.id);
  }

  return cues;
};

const distributeAssetCues = (
  assets: PipelineAsset[],
  durationSeconds: number,
): SceneFocusCue[] => {
  const durationMs = Math.round(durationSeconds * 1000);
  const cueCount = Math.min(assets.length, Math.max(1, Math.ceil(durationSeconds / 1.6)));
  const selectedAssets = assets.slice(0, cueCount);
  const windowMs = Math.max(1100, Math.floor(durationMs / selectedAssets.length));

  return selectedAssets.map((asset, index) => {
    const startMs = Math.min(durationMs - 700, index * windowMs);
    return {
      assetId: asset.id,
      label: asset.title,
      startMs: Math.max(0, startMs),
      endMs: Math.min(durationMs, Math.max(startMs + 900, (index + 1) * windowMs)),
    };
  });
};

const normalizeCueOrder = (
  cues: SceneFocusCue[],
  durationSeconds: number,
): SceneFocusCue[] => {
  const durationMs = Math.round(durationSeconds * 1000);
  return cues
    .map((cue) => ({
      ...cue,
      startMs: Math.max(0, Math.min(durationMs, Math.round(cue.startMs))),
      endMs: Math.max(0, Math.min(durationMs, Math.round(cue.endMs))),
    }))
    .filter((cue) => cue.endMs - cue.startMs >= 500)
    .sort((a, b) => a.startMs - b.startMs || a.assetId.localeCompare(b.assetId));
};

const focusKeys = (asset: PipelineAsset): string[] => {
  const rawKeys = [asset.title, ...asset.tags]
    .map(normalizeKey)
    .filter((key) => key.length >= 4);

  return [...new Set(rawKeys)].sort((a, b) => b.length - a.length);
};

const normalizeKey = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\u0451/gu, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
};
