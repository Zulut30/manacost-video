import fs from "node:fs";
import { finalVideoPath } from "./manifest";
import { probeMedia } from "./audio";
import type { PipelineManifest } from "./types";

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
  return /does not exist|Unexpected|shorter than target|longer than target|audio stream|video stream|voiceover was skipped/iu.test(
    warning,
  );
};

export const qaVideo = (manifest: PipelineManifest): PipelineManifest => {
  const outputPath = manifest.render?.outputPath || finalVideoPath(manifest.slug);
  const warnings = [...(manifest.render?.warnings || [])];

  if (!fs.existsSync(outputPath)) {
    return {
      ...manifest,
      render: {
        ...manifest.render,
        outputPath,
        ok: false,
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
      ok: warnings.every((warning) => !isCriticalWarning(warning)),
      warnings,
    },
    updatedAt: new Date().toISOString(),
  };
};
