import path from "node:path";

export const PROJECT_ROOT = path.resolve(__dirname, "../..");
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
export const RUNS_PUBLIC_DIR = path.join(PUBLIC_DIR, "runs");

export const DEFAULT_WIDTH = 2560;
export const DEFAULT_HEIGHT = 1440;
export const DEFAULT_FPS = Number(process.env.VIDEO_FPS || 30);
export const DEFAULT_TARGET_MINUTES = Number(
  process.env.VIDEO_TARGET_MINUTES || 4,
);
export const DEFAULT_MIN_MINUTES = 3;
export const DEFAULT_MAX_MINUTES = 5;

export const HSDATA_API_BASE = "https://db.kolodahs.ru/api/v1";
export const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
