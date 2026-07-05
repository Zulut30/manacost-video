import fs from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import sanitize from "sanitize-filename";
import { PUBLIC_DIR } from "./constants";

export const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

export const readJson = <T>(filePath: string): T => {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
};

export const writeJson = (filePath: string, value: unknown): void => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const writeText = (filePath: string, value: string): void => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
};

export const toPublicPath = (absolutePath: string): string => {
  return path.relative(PUBLIC_DIR, absolutePath).replaceAll(path.sep, "/");
};

export const safeFilePart = (value: string): string => {
  const cleaned = sanitize(value).replace(/\s+/g, "-").toLowerCase();
  return cleaned.replace(/[^a-zа-яё0-9._-]+/giu, "-").replace(/-+/g, "-");
};

export const inferExtension = (
  url: string,
  contentType: string | null,
): string => {
  const fromType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (fromType === "image/jpeg") {
    return ".jpg";
  }
  if (fromType === "image/png") {
    return ".png";
  }
  if (fromType === "image/webp") {
    return ".webp";
  }
  if (fromType === "audio/mpeg") {
    return ".mp3";
  }

  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).toLowerCase();
  return ext || ".bin";
};

export const downloadFile = async (
  url: string,
  outputPath: string,
  options: { force?: boolean } = {},
): Promise<{ path: string; contentType: string | null; bytes: number }> => {
  if (!options.force && fs.existsSync(outputPath)) {
    return {
      path: outputPath,
      contentType: null,
      bytes: fs.statSync(outputPath).size,
    };
  }

  ensureDir(path.dirname(outputPath));
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "ManacostVideoPipeline/1.0 (+https://hs-manacost.ru; article video generator)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  return {
    path: outputPath,
    contentType: response.headers.get("content-type"),
    bytes: buffer.byteLength,
  };
};

export const getImageDimensions = (
  filePath: string,
): { width?: number; height?: number } => {
  try {
    const dimensions = imageSize(fs.readFileSync(filePath));
    return {
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch {
    return {};
  }
};
