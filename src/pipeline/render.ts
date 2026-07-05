import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { PROJECT_ROOT } from "./constants";
import { finalVideoPath } from "./manifest";
import type { PipelineManifest } from "./types";

export const renderManifest = async (
  manifest: PipelineManifest,
): Promise<PipelineManifest> => {
  const entryPoint = path.join(PROJECT_ROOT, "src", "index.ts");
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });
  const composition = await selectComposition({
    serveUrl,
    id: "ArticleVideo",
    inputProps: { manifest },
  });
  const outputLocation = finalVideoPath(manifest.slug);

  await renderMedia({
    composition,
    serveUrl,
    codec: manifest.target.codec,
    outputLocation,
    inputProps: { manifest },
    imageFormat: "jpeg",
    pixelFormat: "yuv420p",
    timeoutInMilliseconds: 600000,
  });

  return {
    ...manifest,
    render: {
      ...(manifest.render || { warnings: [] }),
      outputPath: outputLocation,
    },
    updatedAt: new Date().toISOString(),
  };
};
