import type { Caption } from "@remotion/captions";

export type AssetKind = "image" | "audio";
export type AssetSource = "article" | "hsdata" | "generated" | "local";
export type VisualRole = "hero" | "scene" | "card" | "background" | "music";
export type ShotType =
  | "hook_montage"
  | "card_lineup"
  | "card_spotlight"
  | "pair_compare"
  | "tier_stack"
  | "warning_cut"
  | "verdict_wall"
  | "article_cutaway";

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

export type ArticleCardCategory =
  | "best-legendary"
  | "situational-legendary"
  | "best-epic"
  | "situational-epic"
  | "last-year"
  | "other";

export type ArticleCardMention = {
  id: string;
  name: string;
  cardId?: string;
  imageUrl?: string;
  rarity?: string;
  sectionHeading: string;
  category: ArticleCardCategory;
  text: string;
  order: number;
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
  cardMentions: ArticleCardMention[];
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

export type SceneFocusCue = {
  assetId: string;
  startMs: number;
  endMs: number;
  label?: string;
};

export type VideoScene = {
  id: string;
  title: string;
  shotType?: ShotType;
  headline?: string;
  beats?: string[];
  sectionTitle?: string;
  narration: string;
  onScreenText: string;
  keywords: string[];
  cardNames?: string[];
  cardIds?: string[];
  assetIds: string[];
  audioPath?: string;
  audioHash?: string;
  durationSeconds: number;
  captions: Caption[];
  focusCues?: SceneFocusCue[];
};

export type VoiceConfig = {
  provider: "elevenlabs" | "edge-tts" | "none";
  modelId: string;
  voiceId?: string;
  voiceName?: string;
  settings?: {
    stability: number;
    similarityBoost: number;
    style: number;
    speed?: number;
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

export type VisualStyleConfig = {
  id: string;
  source: "open-design" | "local";
  designSystem?: string;
  skill?: string;
  palette: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accents: string[];
    danger: string;
  };
  motion: {
    pacing: "calm" | "editorial" | "kinetic";
    cutsPerMinute: number;
    cardCycleSeconds: [number, number];
  };
};

export type ContentCoverageReport = {
  detectedCards: number;
  sceneCards: number;
  assetCards: number;
  missingSceneCards: string[];
  missingAssetCards: string[];
};

export type RenderReport = {
  outputPath?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  ok?: boolean;
  coverage?: ContentCoverageReport;
  warnings: string[];
};

export type PipelineManifest = {
  version: 1;
  slug: string;
  createdAt: string;
  updatedAt: string;
  article: ArticleData;
  target: RenderTarget;
  visualStyle: VisualStyleConfig;
  voice: VoiceConfig;
  music: MusicConfig;
  assets: PipelineAsset[];
  scenes: VideoScene[];
  render?: RenderReport;
};
