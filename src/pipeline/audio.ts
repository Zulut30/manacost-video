import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { toPublicPath } from "./fs";
import { runPublicDir } from "./manifest";
import type { PipelineManifest } from "./types";

type ProbeResult = {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    duration?: string;
  }>;
  format?: {
    duration?: string;
  };
};

export const totalDurationSeconds = (manifest: PipelineManifest): number => {
  return manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
};

export const probeMedia = (filePath: string): ProbeResult => {
  const output = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-print_format",
      "json",
      filePath,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output) as ProbeResult;
};

export const mediaDurationSeconds = (filePath: string): number => {
  const probe = probeMedia(filePath);
  const raw = probe.format?.duration || probe.streams?.[0]?.duration || "0";
  return Number(raw) || 0;
};

export const ensureGeneratedMusic = (
  manifest: PipelineManifest,
  force = false,
): PipelineManifest => {
  const duration = Math.max(30, Math.ceil(totalDurationSeconds(manifest) + 8));
  const audioDir = path.join(runPublicDir(manifest.slug), "audio");
  const outputPath = path.join(audioDir, "generated-ambient-bed.mp3");

  if (force || !fs.existsSync(outputPath)) {
    fs.mkdirSync(audioDir, { recursive: true });
    const fadeOutStart = Math.max(0, duration - 5);
    const filter =
      `[0:a]volume=0.025,lowpass=f=950[a0];` +
      `[1:a]volume=0.018[a1];` +
      `[2:a]volume=0.012[a2];` +
      `[a0][a1][a2]amix=inputs=3,` +
      `afade=t=in:st=0:d=3,afade=t=out:st=${fadeOutStart}:d=5`;

    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `anoisesrc=color=pink:duration=${duration}:sample_rate=44100`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=82:duration=${duration}:sample_rate=44100`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=164:duration=${duration}:sample_rate=44100`,
        "-filter_complex",
        filter,
        "-c:a",
        "libmp3lame",
        "-q:a",
        "5",
        outputPath,
      ],
      { stdio: "ignore" },
    );
  }

  return {
    ...manifest,
    music: {
      enabled: true,
      path: toPublicPath(outputPath),
      title: "Generated quiet ambient bed",
      attribution: "Generated locally with FFmpeg lavfi; replaceable",
      volume: manifest.music.volume,
    },
    updatedAt: new Date().toISOString(),
  };
};
