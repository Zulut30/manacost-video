import path from "node:path";
import {
  downloadFile,
  getImageDimensions,
  inferExtension,
  safeFilePart,
  toPublicPath,
} from "./fs";
import { hsCardToAssetDraft, searchConstructedCards } from "./hsdata";
import { runPublicDir } from "./manifest";
import { extractKeywords, extractNamedPhrases, extractTitlePhrases } from "./text";
import type { PipelineAsset, PipelineManifest } from "./types";

type AssetOptions = {
  force?: boolean;
  maxArticleImages?: number;
  maxHsDataImages?: number;
};

export const collectAssets = async (
  manifest: PipelineManifest,
  options: AssetOptions = {},
): Promise<PipelineManifest> => {
  const articleAssets = await downloadArticleImages(manifest, options);
  const hsDataAssets = await downloadHsDataImages(manifest, options);
  const assets = dedupeAssets([...articleAssets, ...hsDataAssets]);

  return {
    ...manifest,
    assets,
    scenes: linkSceneAssets(manifest, assets),
    updatedAt: new Date().toISOString(),
  };
};

const downloadArticleImages = async (
  manifest: PipelineManifest,
  options: AssetOptions,
): Promise<PipelineAsset[]> => {
  const imagesDir = path.join(runPublicDir(manifest.slug), "images");
  const assets: PipelineAsset[] = [];
  const maxImages = options.maxArticleImages || 10;
  let backgroundCount = 0;

  for (const [index, image] of manifest.article.images.slice(0, maxImages).entries()) {
    try {
      const ext = inferExtension(image.url, null);
      const filename = `article-${String(index + 1).padStart(2, "0")}-${safeFilePart(
        image.alt || manifest.article.title,
      )}${ext}`;
      const absolutePath = path.join(imagesDir, filename);
      const result = await downloadFile(image.url, absolutePath, { force: options.force });
      const dimensions = getImageDimensions(result.path);
      const width = dimensions.width || image.width;
      const height = dimensions.height || image.height;
      const qualityScore = scoreImage(width, height);

      if (qualityScore < 0.2 || !isUsableBackground(width, height)) {
        continue;
      }

      const role = backgroundCount++ === 0 ? "hero" : "background";

      assets.push({
        id: `article-${index + 1}`,
        kind: "image",
        role,
        source: "article",
        title: image.alt || manifest.article.title,
        path: toPublicPath(result.path),
        originalUrl: image.url,
        attribution: manifest.article.url,
        width,
        height,
        tags: extractKeywords([image.alt || "", manifest.article.title], 8),
        qualityScore,
      });
    } catch (error) {
      manifest.render?.warnings.push(
        `Article image skipped: ${image.url} (${String(error)})`,
      );
    }
  }

  return assets;
};

const downloadHsDataImages = async (
  manifest: PipelineManifest,
  options: AssetOptions,
): Promise<PipelineAsset[]> => {
  const imagesDir = path.join(runPublicDir(manifest.slug), "images");
  const maxImages = options.maxHsDataImages || 18;
  const namedQueries = Array.from(
    new Set([
      ...extractNamedPhrases(manifest.article.text, 36),
      ...manifest.article.sections.flatMap((section) =>
        extractNamedPhrases(`${section.heading} ${section.text}`, 8),
      ),
    ]),
  ).filter(isUsefulHsQuery);
  const fallbackQueries = Array.from(
    new Set([
      ...extractTitlePhrases(manifest.article.title, 8),
      ...extractKeywords(
        [
          manifest.article.title,
          manifest.article.description || "",
          ...manifest.scenes.flatMap((scene) => [scene.title, ...scene.keywords]),
        ],
        30,
      ),
    ]),
  ).filter(isUsefulHsQuery);
  const queryPool = namedQueries.length > 0 ? namedQueries : fallbackQueries;
  const assets: PipelineAsset[] = [];
  const seenCardIds = new Set<string>();

  for (const query of queryPool) {
    if (assets.length >= maxImages) {
      break;
    }

    const cards = await searchConstructedCards(query, 3);
    for (const card of cards) {
      if (seenCardIds.has(card.card_id) || assets.length >= maxImages) {
        continue;
      }

      seenCardIds.add(card.card_id);
      const draft = hsCardToAssetDraft(card, assets.length);
      if (!draft.imageUrl) {
        continue;
      }

      const imageUrls = draft.imageUrls?.length
        ? draft.imageUrls
        : ([draft.imageUrl].filter(Boolean) as string[]);
      let lastError: unknown;
      let bestAsset: PipelineAsset | undefined;
      let skippedForQuality = 0;

      for (const [candidateIndex, imageUrl] of imageUrls.entries()) {
        try {
          const ext = inferExtension(imageUrl, null);
          const filename = `hsdata-${String(assets.length + 1).padStart(
            2,
            "0",
          )}-${safeFilePart(draft.title)}-${candidateIndex + 1}${ext}`;
          const absolutePath = path.join(imagesDir, filename);
          const result = await downloadFile(imageUrl, absolutePath, {
            force: options.force,
          });
          const dimensions = getImageDimensions(result.path);
          const qualityScore = scoreImage(dimensions.width, dimensions.height);
          if (!isUsableForeground(dimensions.width, dimensions.height, qualityScore)) {
            skippedForQuality += 1;
            continue;
          }

          const candidateAsset: PipelineAsset = {
            id: draft.id,
            kind: draft.kind,
            role: draft.role,
            source: draft.source,
            title: draft.title,
            path: toPublicPath(result.path),
            originalUrl: imageUrl,
            attribution: draft.attribution,
            width: dimensions.width,
            height: dimensions.height,
            tags: draft.tags,
            qualityScore,
          };

          if (!bestAsset || candidateAsset.qualityScore > bestAsset.qualityScore) {
            bestAsset = candidateAsset;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (bestAsset) {
        assets.push(bestAsset);
      } else if (lastError) {
        manifest.render?.warnings.push(
          `HSData image skipped: ${draft.imageUrl} (${String(lastError)})`,
        );
      } else if (skippedForQuality === imageUrls.length) {
        manifest.render?.warnings.push(
          `HSData image skipped for low visual quality: ${draft.title}`,
        );
      }
    }
  }

  return assets;
};

const normalizeQueryText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\u0451/gu, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
};

const queryWords = (value: string): string[] => {
  return normalizeQueryText(value)
    .split(" ")
    .filter(Boolean);
};

const genericClassWords = new Set(
  [
    "\u043e\u0445\u043e\u0442\u043d\u0438\u043a",
    "\u043e\u0445\u043e\u0442\u043d\u0438\u043a\u0430",
    "\u0434\u0440\u0443\u0438\u0434",
    "\u0434\u0440\u0443\u0438\u0434\u0430",
    "\u043c\u0430\u0433",
    "\u043c\u0430\u0433\u0430",
    "\u043f\u0430\u043b\u0430\u0434\u0438\u043d",
    "\u043f\u0430\u043b\u0430\u0434\u0438\u043d\u0430",
    "\u0440\u0430\u0437\u0431\u043e\u0439\u043d\u0438\u043a",
    "\u0440\u0430\u0437\u0431\u043e\u0439\u043d\u0438\u043a\u0430",
    "\u0440\u044b\u0446\u0430\u0440\u044c",
    "\u0440\u044b\u0446\u0430\u0440\u044f",
    "\u0432\u043e\u0438\u043d",
    "\u0432\u043e\u0438\u043d\u0430",
    "\u0448\u0430\u043c\u0430\u043d",
    "\u0448\u0430\u043c\u0430\u043d\u0430",
    "\u0436\u0440\u0435\u0446",
    "\u0436\u0440\u0435\u0446\u0430",
    "\u0447\u0435\u0440\u043d\u043e\u043a\u043d\u0438\u0436\u043d\u0438\u043a",
    "\u0447\u0435\u0440\u043d\u043e\u043a\u043d\u0438\u0436\u043d\u0438\u043a\u0430",
  ].map(normalizeQueryText),
);

const genericHsQueries = new Set(
  [
    "\u0442\u043e\u043a\u0435\u043d \u043f\u0430\u043b\u0430\u0434\u0438\u043d",
    "\u0434\u0440\u0430\u043a\u043e\u043d \u0434\u0440\u0443\u0438\u0434\u0430",
    "\u0444\u0435\u0439\u0441 \u043e\u0445\u043e\u0442\u043d\u0438\u043a",
    "\u0431\u0435\u0440\u043d \u043c\u0430\u0433\u0430",
    "\u043f\u0438\u0442\u043e\u043c\u0435\u0446 \u043e\u0445\u043e\u0442\u043d\u0438\u043a\u0430",
    "\u043f\u0440\u043e\u043a\u043b\u044f\u0442\u044b\u0435",
    "\u043b\u0435\u043d\u0442\u044b",
    "\u0431\u0438\u0442\u0432\u0430",
    "\u043b\u0443\u0447\u0448\u0438\u0435",
    "\u0441\u0438\u0442\u0443\u0430\u0442\u0438\u0432\u043d\u044b\u0435",
  ].map(normalizeQueryText),
);

const isUsefulHsQuery = (query: string): boolean => {
  const normalized = normalizeQueryText(query);
  const words = queryWords(query);

  if (normalized.length < 5 || genericHsQueries.has(normalized)) {
    return false;
  }

  if (
    words.length === 1 &&
    (genericClassWords.has(words[0]) || words[0].length < 5)
  ) {
    return false;
  }

  return !words.every((word) => genericClassWords.has(word));
};

const scoreImage = (width?: number, height?: number): number => {
  if (!width || !height) {
    return 0.5;
  }
  const pixels = width * height;
  if (pixels >= 1920 * 1080) {
    return 1;
  }
  if (pixels >= 900 * 600) {
    return 0.75;
  }
  if (pixels >= 480 * 360) {
    return 0.45;
  }
  return 0.15;
};

const isUsableForeground = (
  width?: number,
  height?: number,
  qualityScore = 0,
): boolean => {
  if (!width || !height) {
    return false;
  }
  const pixels = width * height;
  const aspect = width / height;
  const looksLikeReadableCard = height >= 540 && aspect >= 0.52 && aspect <= 0.9;
  const looksLikeHighResArt = pixels >= 700 * 700 && aspect >= 0.48 && aspect <= 1.35;

  return looksLikeHighResArt || looksLikeReadableCard || qualityScore >= 0.7;
};

const imageAspect = (asset: Pick<PipelineAsset, "width" | "height">): number => {
  if (!asset.width || !asset.height) {
    return 0;
  }
  return asset.width / asset.height;
};

const isUsableBackground = (width?: number, height?: number): boolean => {
  if (!width || !height) {
    return false;
  }
  const aspect = width / height;
  const pixels = width * height;

  return aspect >= 1.35 && aspect <= 2.4 && pixels >= 900 * 500;
};

const isBackgroundAsset = (asset: PipelineAsset): boolean => {
  return (
    (asset.role === "hero" || asset.role === "background") &&
    isUsableBackground(asset.width, asset.height)
  );
};

const assetMatchesScene = (asset: PipelineAsset, keywordText: string): boolean => {
  return asset.tags.some((tag) => keywordText.includes(tag.toLowerCase()));
};

const foregroundPriority = (asset: PipelineAsset): number => {
  const aspect = imageAspect(asset);
  const isCardShaped = aspect >= 0.55 && aspect <= 1.05 ? 1 : 0;
  const sourceBoost = asset.source === "hsdata" ? 0.8 : 0;
  const articlePenalty = asset.source === "article" ? 1 : 0;

  return asset.qualityScore + isCardShaped * 0.2 + sourceBoost - articlePenalty;
};

const linkSceneAssets = (
  manifest: PipelineManifest,
  assets: PipelineAsset[],
): PipelineManifest["scenes"] => {
  const visualAssets = assets.filter((asset) => asset.kind === "image");
  const backgroundAssets = visualAssets
    .filter(isBackgroundAsset)
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const foregroundAssets = visualAssets
    .filter(
      (asset) =>
        !isBackgroundAsset(asset) &&
        isUsableForeground(asset.width, asset.height, asset.qualityScore),
    )
    .sort((a, b) => foregroundPriority(b) - foregroundPriority(a));
  const preferredForegroundAssets =
    foregroundAssets.filter((asset) => asset.source === "hsdata").length > 0
      ? foregroundAssets.filter((asset) => asset.source === "hsdata")
      : foregroundAssets;
  const heroAsset = backgroundAssets.find((asset) => asset.role === "hero");

  return manifest.scenes.map((scene, index) => {
    const keywordText = scene.keywords.join(" ").toLowerCase();
    const backgroundMatch = backgroundAssets.find((asset) =>
      assetMatchesScene(asset, keywordText),
    );
    const foregroundMatches = foregroundAssets.filter((asset) =>
      assetMatchesScene(asset, keywordText),
    ).sort((a, b) => foregroundPriority(b) - foregroundPriority(a));
    const fallbackBackground =
      backgroundAssets[index % Math.max(1, backgroundAssets.length)];
    const foregroundStart =
      (index * 2) % Math.max(1, preferredForegroundAssets.length);
    const fallbackForeground = [
      preferredForegroundAssets[foregroundStart],
      preferredForegroundAssets[
        (foregroundStart + 1) % Math.max(1, preferredForegroundAssets.length)
      ],
      preferredForegroundAssets[
        (foregroundStart + 2) % Math.max(1, preferredForegroundAssets.length)
      ],
    ];
    const chosenBackground =
      (index === 0 && heroAsset) || backgroundMatch || fallbackBackground;
    const chosen = Array.from(
      new Set([
        chosenBackground?.id,
        ...foregroundMatches.map((asset) => asset.id),
        ...fallbackForeground.map((asset) => asset?.id),
      ].filter(Boolean) as string[]),
    ).slice(0, 4);

    return {
      ...scene,
      assetIds: chosen,
    };
  });
};

const dedupeAssets = (assets: PipelineAsset[]): PipelineAsset[] => {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = asset.originalUrl || asset.path;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
