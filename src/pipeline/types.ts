import type { Caption } from "@remotion/captions";

export type AssetKind = "image" | "audio";
export type AssetSource = "article" | "hsdata" | "generated" | "local";
export type VisualRole = "hero" | "scene" | "card" | "background" | "music";

export type ArticleImage = {
  id: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
};

export type ArticleSection = {
  heading: string;
  text: string;
};

export type ArticleData = {
  url: string;
  slug: string;
  title: string;
  description?: string;
  siteName?: string;
  author?: string;
  publishedAt?: string;
  text: string;
  sections: ArticleSection[];
  images: ArticleImage[];
};

export type PipelineAsset = {
  id: string;
  kind: AssetKind;
  role: VisualRole;
  source: AssetSource;
  title: string;
  path: string;
  originalUrl?: string;
  attribution?: string;
  width?: number;
  height?: number;
  tags: string[];
  qualityScore: number;
};

export type VideoScene = {
  id: string;
  title: string;
  headline?: string;
  beats?: string[];
  sectionTitle?: string;
  narration: string;
  onScreenText: string;
  keywords: string[];
  assetIds: string[];
  audioPath?: string;
  durationSeconds: number;
  captions: Caption[];
};

export type VoiceConfig = {
  provider: "elevenlabs" | "none";
  modelId: string;
  voiceId?: string;
  voiceName?: string;
  settings?: {
    stability: number;
    similarityBoost: number;
    style: number;
  };
};

export type MusicConfig = {
  enabled: boolean;
  path?: string;
  title?: string;
  attribution?: string;
  volume: number;
};

export type RenderTarget = {
  width: number;
  height: number;
  fps: number;
  codec: "h264" | "h265";
  minMinutes: number;
  maxMinutes: number;
};

export type RenderReport = {
  outputPath?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  ok?: boolean;
  warnings: string[];
};

export type PipelineManifest = {
  version: 1;
  slug: string;
  createdAt: string;
  updatedAt: string;
  article: ArticleData;
  target: RenderTarget;
  voice: VoiceConfig;
  music: MusicConfig;
  assets: PipelineAsset[];
  scenes: VideoScene[];
  render?: RenderReport;
};
