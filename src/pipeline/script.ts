import { captionsFromText } from "./subtitles";
import {
  clampText,
  cleanText,
  estimateSpeechSeconds,
  extractKeywords,
  extractTitlePhrases,
  splitSentences,
} from "./text";
import type { ArticleData, PipelineManifest, VideoScene } from "./types";
import {
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_MAX_MINUTES,
  DEFAULT_MIN_MINUTES,
  DEFAULT_TARGET_MINUTES,
  DEFAULT_WIDTH,
  ELEVENLABS_MODEL_ID,
} from "./constants";

type BuildSceneOptions = {
  targetMinutes?: number;
};

const FALLBACK_HOOKS = [
  "Крафт без паники",
  "Пыль дороже хайпа",
  "Легендарки: точечно",
  "Эпики: не спешить",
  "Сначала мета",
  "Проверяй архетип",
  "Финальный вердикт",
];

const BORING_HEADINGS = new Set([
  "главное",
  "итог",
  "обновлено",
  "hearthstone",
  "manacost",
]);

const sceneTitle = (value: string): string => {
  const clean = cleanText(value).replace(/[.?!]+$/u, "");
  return clean.length > 46 ? `${clean.slice(0, 43)}...` : clean;
};

const shortLine = (value: string, maxChars: number): string => {
  const clean = cleanText(value)
    .replace(/\(.+?\)/gu, "")
    .replace(/\s+[|:]\s*Manacost$/iu, "")
    .trim();

  if (clean.length <= maxChars) {
    return clean;
  }

  const words = clean.split(/\s+/u);
  const picked: string[] = [];
  for (const word of words) {
    const next = [...picked, word].join(" ");
    if (next.length > maxChars) {
      break;
    }
    picked.push(word);
  }

  return picked.length > 0 ? picked.join(" ") : clean.slice(0, maxChars);
};

const normalizeHeading = (value: string | undefined, index: number): string => {
  const clean = shortLine(value || "", 32);
  if (!clean || BORING_HEADINGS.has(clean.toLowerCase())) {
    return FALLBACK_HOOKS[index % FALLBACK_HOOKS.length];
  }
  return clean;
};

const makeHeadline = (
  article: ArticleData,
  title: string,
  sceneIndex: number,
): string => {
  if (sceneIndex === 0) {
    return article.title.toLowerCase().includes("крафт")
      ? "Что крафтить?"
      : "Главный вопрос";
  }

  return normalizeHeading(title, sceneIndex);
};

const makeBeats = (headline: string, text: string, sceneIndex: number): string[] => {
  const lower = headline.toLowerCase();
  if (sceneIndex === 0) {
    return ["Не все легендарки стоят пыли", "Сначала смотри на мету"];
  }
  if (lower.includes("легендар")) {
    return ["Крафт только под колоду", "Проверяй долгий потенциал"];
  }
  if (lower.includes("эпич")) {
    return ["Сильные карты не всегда срочные", "Пыль тратить точечно"];
  }
  if (lower.includes("вердикт")) {
    return ["Не крафти все подряд", "Выбери 1-2 архетипа"];
  }
  if (lower.includes("хайп") || lower.includes("мета")) {
    return ["Первые дни часто обманывают", "Дождись стабильной меты"];
  }

  const sentences = splitSentences(text);
  const picked = sentences
    .map((sentence) => shortLine(sentence, 54))
    .filter((sentence) => sentence.length >= 12)
    .slice(0, 2);

  if (picked.length > 0) {
    return picked;
  }

  return sceneIndex % 2 === 0
    ? ["Не трать пыль вслепую", "Сначала проверь мету"]
    : ["Выбирай архетип", "Крафти только основу"];
};

const sceneNarration = (
  article: ArticleData,
  sectionText: string,
  sceneIndex: number,
  maxChars: number,
): string => {
  const base = clampText(sectionText, maxChars);
  if (sceneIndex === 0) {
    return cleanText(
      `Разбираем гайд Manacost по крафту после Катаклизма. Цель простая: понять, где пыль действительно дает силу, а где лучше подождать первых мета-отчетов. ${base}`,
    );
  }

  return base;
};

const sectionChunks = (article: ArticleData, targetSceneCount: number): string[] => {
  const sourceSections =
    article.sections.length > 0
      ? article.sections
      : [{ heading: "Главное", text: article.text }];
  const chunks: string[] = [];

  for (const section of sourceSections) {
    const sentences = splitSentences(section.text);
    if (sentences.length <= 5) {
      chunks.push(section.text);
      continue;
    }

    for (let index = 0; index < sentences.length; index += 5) {
      chunks.push(sentences.slice(index, index + 5).join(" "));
    }
  }

  return chunks.slice(0, Math.max(targetSceneCount, 5));
};

export const buildScenes = (
  article: ArticleData,
  options: BuildSceneOptions = {},
): VideoScene[] => {
  const targetMinutes = options.targetMinutes || DEFAULT_TARGET_MINUTES;
  const targetSceneCount = Math.min(8, Math.max(6, Math.round(targetMinutes * 1.7)));
  const chunks = sectionChunks(article, targetSceneCount - 2);
  const selectedChunks = chunks.slice(0, targetSceneCount - 2);
  const scenes: VideoScene[] = [];

  const introText = sceneNarration(
    article,
    selectedChunks[0] || article.text,
    0,
    430,
  );
  scenes.push(makeScene(article, "scene-01-intro", "Что крафтить?", introText, 0));

  selectedChunks.forEach((chunk, index) => {
    const section = article.sections[index % Math.max(1, article.sections.length)];
    const narration = sceneNarration(article, chunk, index + 1, 560);
    scenes.push(
      makeScene(
        article,
        `scene-${String(index + 2).padStart(2, "0")}`,
        section?.heading || FALLBACK_HOOKS[(index + 1) % FALLBACK_HOOKS.length],
        narration,
        index + 1,
      ),
    );
  });

  const keywords = extractKeywords([article.title, article.text], 5).join(", ");
  const outroText = cleanText(
    `Финальный вывод: не крафтите все подряд. Выберите один-два архетипа, дождитесь первых мета-сигналов и тратьте пыль только на карты, которые реально держат колоду. Главные ориентиры: ${keywords}.`,
  );
  scenes.push(
    makeScene(
      article,
      `scene-${String(scenes.length + 1).padStart(2, "0")}-outro`,
      "Финальный вердикт",
      outroText,
      scenes.length,
    ),
  );

  return normalizeSceneDurations(scenes, targetMinutes);
};

const makeScene = (
  article: ArticleData,
  id: string,
  title: string,
  narration: string,
  sceneIndex: number,
): VideoScene => {
  const headline = makeHeadline(article, title, sceneIndex);
  const durationSeconds = estimateSpeechSeconds(narration) + 2;
  const keywords = Array.from(
    new Set([
      ...extractKeywords([title, narration, article.title], 10),
      ...extractTitlePhrases(title, 4),
    ]),
  ).slice(0, 12);

  return {
    id,
    title: sceneTitle(title),
    headline,
    beats: makeBeats(headline, narration, sceneIndex),
    narration,
    onScreenText: headline,
    keywords,
    assetIds: [],
    durationSeconds,
    captions: captionsFromText(narration, durationSeconds),
  };
};

const normalizeSceneDurations = (
  scenes: VideoScene[],
  targetMinutes: number,
): VideoScene[] => {
  const currentSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const targetSeconds = Math.min(
    DEFAULT_MAX_MINUTES * 60,
    Math.max(DEFAULT_MIN_MINUTES * 60, targetMinutes * 60),
  );
  const multiplier = targetSeconds / Math.max(1, currentSeconds);

  if (multiplier > 0.85 && multiplier < 1.2) {
    return scenes;
  }

  return scenes.map((scene) => {
    const durationSeconds = Math.max(16, Math.round(scene.durationSeconds * multiplier));
    return {
      ...scene,
      durationSeconds,
      captions: captionsFromText(scene.narration, durationSeconds),
    };
  });
};

export const buildInitialManifest = (
  article: ArticleData,
  options: BuildSceneOptions = {},
): PipelineManifest => {
  const now = new Date().toISOString();

  return {
    version: 1,
    slug: article.slug,
    createdAt: now,
    updatedAt: now,
    article,
    target: {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      fps: DEFAULT_FPS,
      codec: "h264",
      minMinutes: DEFAULT_MIN_MINUTES,
      maxMinutes: DEFAULT_MAX_MINUTES,
    },
    voice: {
      provider: "none",
      modelId: ELEVENLABS_MODEL_ID,
    },
    music: {
      enabled: true,
      volume: 0.08,
    },
    assets: [],
    scenes: buildScenes(article, options),
    render: {
      warnings: [],
    },
  };
};
