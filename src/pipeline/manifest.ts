import path from "node:path";
import type { Caption } from "@remotion/captions";
import { OUTPUT_DIR, RUNS_PUBLIC_DIR } from "./constants";
import { ensureDir, readJson, writeJson, writeText } from "./fs";
import { toSrt } from "./subtitles";
import type { PipelineManifest } from "./types";

export const runPublicDir = (slug: string): string => path.join(RUNS_PUBLIC_DIR, slug);
export const outputDir = (slug: string): string => path.join(OUTPUT_DIR, slug);
export const manifestPath = (slug: string): string =>
  path.join(outputDir(slug), "manifest.json");
export const scriptPath = (slug: string): string =>
  path.join(outputDir(slug), "script.md");
export const subtitlesPath = (slug: string): string =>
  path.join(outputDir(slug), "subtitles.srt");
export const renderReportPath = (slug: string): string =>
  path.join(outputDir(slug), "render-report.json");
export const finalVideoPath = (slug: string): string =>
  path.join(outputDir(slug), "final-2k.mp4");

export const saveManifestArtifacts = (manifest: PipelineManifest): void => {
  const outDir = outputDir(manifest.slug);
  ensureDir(outDir);
  const updatedManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
  };

  writeJson(manifestPath(manifest.slug), updatedManifest);
  writeText(scriptPath(manifest.slug), scriptMarkdown(updatedManifest));
  writeText(
    subtitlesPath(manifest.slug),
    toSrt(globalCaptions(updatedManifest)),
  );
  writeJson(renderReportPath(manifest.slug), updatedManifest.render || { warnings: [] });
};

const globalCaptions = (manifest: PipelineManifest): Caption[] => {
  let offsetMs = 0;
  const captions: Caption[] = [];

  for (const scene of manifest.scenes) {
    for (const caption of scene.captions) {
      captions.push({
        ...caption,
        startMs: caption.startMs + offsetMs,
        endMs: caption.endMs + offsetMs,
      });
    }
    offsetMs += Math.round(scene.durationSeconds * 1000);
  }

  return captions;
};

export const loadManifest = (slugOrPath: string): PipelineManifest => {
  const filePath = slugOrPath.endsWith(".json")
    ? path.resolve(slugOrPath)
    : manifestPath(slugOrPath);
  return readJson<PipelineManifest>(filePath);
};

const scriptMarkdown = (manifest: PipelineManifest): string => {
  const lines = [
    `# ${manifest.article.title}`,
    "",
    `Source: ${manifest.article.url}`,
    `Target: ${manifest.target.width}x${manifest.target.height}, ${manifest.target.fps}fps`,
    `Voice: ${manifest.voice.voiceName || manifest.voice.provider}`,
    "",
  ];

  for (const scene of manifest.scenes) {
    lines.push(`## ${scene.title}`);
    lines.push("");
    lines.push(scene.narration);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};
