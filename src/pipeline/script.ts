import { captionsFromText } from "./subtitles";
import {
  cleanText,
  estimateSpeechSeconds,
  extractKeywords,
  extractTitlePhrases,
  splitSentences,
} from "./text";
import type {
  ArticleCardCategory,
  ArticleCardMention,
  ArticleData,
  PipelineManifest,
  ShotType,
  VideoScene,
} from "./types";
import {
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_MAX_MINUTES,
  DEFAULT_MIN_MINUTES,
  DEFAULT_TARGET_MINUTES,
  DEFAULT_WIDTH,
  ELEVENLABS_MODEL_ID,
} from "./constants";
import { loadVisualStyle } from "./style";

type BuildSceneOptions = {
  targetMinutes?: number;
};

type DraftScene = {
  idSuffix: string;
  title: string;
  headline: string;
  lead: string;
  mentions: ArticleCardMention[];
  shotType?: ShotType;
  beats?: string[];
  includeReasons?: boolean;
};

const CATEGORY_ORDER: ArticleCardCategory[] = [
  "best-legendary",
  "situational-legendary",
  "best-epic",
  "situational-epic",
  "last-year",
  "other",
];

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

const normalizeText = (value: string): string => {
  return cleanText(value)
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[’'`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
};

const cardNameList = (mentions: ArticleCardMention[], limit = 4): string => {
  const names = mentions.slice(0, limit).map((mention) => mention.name);
  if (names.length <= 1) {
    return names[0] || "";
  }

  return `${names.slice(0, -1).join(", ")} и ${names.at(-1)}`;
};

const reasonFromMention = (mention: ArticleCardMention): string => {
  const afterDash = mention.text.split(/\s+[—–-]\s+/u).slice(1).join(" — ");
  const source = afterDash || mention.text;
  const firstSentence = splitSentences(source)[0] || source;
  const normalizedName = normalizeText(mention.name);
  const withoutRepeatedName = cleanText(firstSentence).replace(
    new RegExp(`^${mention.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*[—–-]?\\s*`, "iu"),
    "",
  );

  if (normalizeText(withoutRepeatedName) === normalizedName) {
    return "ключевая карта своего архетипа.";
  }

  return `${shortLine(withoutRepeatedName, 145)}.`
    .replace(/\.\.+$/u, ".")
    .replace(/\s+\./u, ".");
};

const groupedMentions = (
  article: ArticleData,
): Record<ArticleCardCategory, ArticleCardMention[]> => {
  const groups: Record<ArticleCardCategory, ArticleCardMention[]> = {
    "best-legendary": [],
    "situational-legendary": [],
    "best-epic": [],
    "situational-epic": [],
    "last-year": [],
    other: [],
  };

  for (const mention of article.cardMentions || []) {
    groups[mention.category]?.push(mention);
  }

  for (const category of CATEGORY_ORDER) {
    groups[category].sort((a, b) => a.order - b.order);
  }

  return groups;
};

const splitGroup = (
  mentions: ArticleCardMention[],
  firstSize: number,
): [ArticleCardMention[], ArticleCardMention[]] => {
  return [mentions.slice(0, firstSize), mentions.slice(firstSize)];
};

const makeCardNarration = (draft: DraftScene): string => {
  if (draft.includeReasons === false || draft.mentions.length === 0) {
    return cleanText(shortLine(draft.lead, 260));
  }

  const detailedMentions = draft.mentions.slice(0, 2);
  const remainingMentions = draft.mentions.slice(2);
  const compactLead = shortLine(draft.lead, 180);
  const points = detailedMentions
    .map((mention) => `${mention.name}: ${shortLine(reasonFromMention(mention), 78)}`)
    .join(" ");
  const remaining = remainingMentions.length
    ? `Также в блоке: ${cardNameList(remainingMentions, 6)}.`
    : "";

  return cleanText(`${compactLead} ${points} ${remaining}`);
};

const makeCardBeats = (
  draft: DraftScene,
  sceneIndex: number,
): string[] => {
  if (draft.beats?.length) {
    return draft.beats;
  }

  const names = draft.mentions.map((mention) => mention.name);
  if (names.length === 0) {
    return sceneIndex === 0
      ? ["Разбираем только крафт", "Без лишнего пересказа"]
      : ["Смотри на архетип", "Не трать пыль вслепую"];
  }

  const text = normalizeText(`${draft.title} ${draft.headline}`);
  if (text.includes("главные") || text.includes("ядро")) {
    return ["Крафтить сейчас", "Карты держат архетип"];
  }
  if (text.includes("архетип")) {
    return ["Только под колоду", "Сначала выбери сборку"];
  }
  if (text.includes("точечно") || text.includes("потенциал")) {
    return ["Можно, но не всем", "Проверяй готовую сборку"];
  }
  if (text.includes("пауза") || text.includes("подождать")) {
    return ["Не первый крафт", "Риск слабой меты"];
  }
  if (text.includes("эпики") || text.includes("отдач")) {
    return ["Больше пользы за пыль", "Чаще входят в списки"];
  }
  if (text.includes("автокрафт") || text.includes("ситуатив")) {
    return ["Не автокрафт", "Только под план игры"];
  }

  return ["Смотри на архетип", "Крафти по роли карты"];
};

const makeScene = (
  article: ArticleData,
  draft: DraftScene,
  sceneIndex: number,
): VideoScene => {
  const narration = makeCardNarration(draft);
  const durationSeconds = Math.max(12, estimateSpeechSeconds(narration) + 1);
  const cardNames = draft.mentions.map((mention) => mention.name);
  const cardIds = draft.mentions
    .map((mention) => mention.cardId)
    .filter(Boolean) as string[];
  const keywords = Array.from(
    new Set([
      ...cardNames,
      ...cardIds,
      ...extractKeywords([draft.title, narration, article.title], 8),
      ...extractTitlePhrases(draft.title, 4),
    ]),
  ).slice(0, 18);

  return {
    id: `scene-${String(sceneIndex + 1).padStart(2, "0")}-${draft.idSuffix}`,
    title: shortLine(draft.title, 52),
    shotType: draft.shotType || inferShotType(draft, sceneIndex),
    headline: draft.headline,
    beats: makeCardBeats(draft, sceneIndex),
    sectionTitle: draft.mentions[0]?.sectionHeading,
    narration,
    onScreenText: draft.headline,
    keywords,
    cardNames,
    cardIds,
    assetIds: [],
    durationSeconds,
    captions: captionsFromText(narration, durationSeconds),
  };
};

const inferShotType = (draft: DraftScene, sceneIndex: number): ShotType => {
  if (sceneIndex === 0) {
    return "hook_montage";
  }
  if (draft.idSuffix.includes("playable")) {
    return "pair_compare";
  }
  if (draft.idSuffix.includes("caution") || draft.idSuffix.includes("situational")) {
    return "warning_cut";
  }
  if (draft.idSuffix.includes("core")) {
    return "tier_stack";
  }
  if (draft.idSuffix.includes("support") || draft.idSuffix.includes("archetype")) {
    return "card_lineup";
  }
  if (draft.idSuffix.includes("verdict")) {
    return "verdict_wall";
  }
  return "card_spotlight";
};

const buildCardScenes = (article: ArticleData): DraftScene[] => {
  const groups = groupedMentions(article);
  const [bestLegendaryCore, bestLegendarySupport] = splitGroup(
    groups["best-legendary"],
    4,
  );
  const [situationalLegendaryPlayable, situationalLegendaryCaution] = splitGroup(
    groups["situational-legendary"],
    4,
  );
  const [bestEpicCore, bestEpicSupport] = splitGroup(groups["best-epic"], 5);
  const [situationalEpicCore] = splitGroup(groups["situational-epic"], 6);
  const lastYear = groups["last-year"];
  const otherCards = groups.other;
  const introCards = [
    ...bestLegendaryCore.slice(0, 2),
    ...bestEpicCore.slice(0, 2),
  ];

  const drafts: DraftScene[] = [
    {
      idSuffix: "intro",
      title: "Что реально крафтить",
      headline: "Крафт без мусора",
      lead:
        "Это короткий разбор гайда по крафту КАТАКЛИЗМА. Не пересказываем всю статью: идем по картам, которые прямо влияют на колоды, и отдельно отмечаем позиции, где лучше не спешить.",
      mentions: introCards,
      beats: ["Только конкретные карты", "Сначала сила, потом риск"],
      includeReasons: false,
    },
  ];

  if (bestLegendaryCore.length > 0) {
    drafts.push({
      idSuffix: "best-legendaries-core",
      title: "Лучшие легендарки: ядро меты",
      headline: "Главные легендарки",
      lead: `В верхнем приоритете ${cardNameList(bestLegendaryCore)}. Это не косметические крафты, а карты, вокруг которых держится сила архетипов.`,
      mentions: bestLegendaryCore,
    });
  }

  if (bestLegendarySupport.length > 0) {
    drafts.push({
      idSuffix: "best-legendaries-archetypes",
      title: "Легендарки под конкретную колоду",
      headline: "Крафт под архетип",
      lead: `Следующая группа сильная, но ее стоит крафтить только под выбранную колоду: ${cardNameList(bestLegendarySupport, 5)}.`,
      mentions: bestLegendarySupport,
    });
  }

  if (situationalLegendaryPlayable.length > 0) {
    drafts.push({
      idSuffix: "situational-legendaries-playable",
      title: "Ситуативные легендарки с потенциалом",
      headline: "Можно, но точечно",
      lead: `Эти легендарки не универсальны. Их берут, когда уже есть подходящая сборка: ${cardNameList(situationalLegendaryPlayable)}.`,
      mentions: situationalLegendaryPlayable,
    });
  }

  if (situationalLegendaryCaution.length > 0) {
    drafts.push({
      idSuffix: "situational-legendaries-caution",
      title: "Легендарки, где лучше подождать",
      headline: "Пыль на паузу",
      lead: `Здесь главный риск — слабый или нестабильный архетип. Без любви к конкретной колоде эти карты лучше не ставить в первый крафт.`,
      mentions: situationalLegendaryCaution,
    });
  }

  if (bestEpicCore.length > 0) {
    drafts.push({
      idSuffix: "best-epics-core",
      title: "Лучшие эпики КАТАКЛИЗМА",
      headline: "Эпики с отдачей",
      lead: `Среди эпиков быстрее всего окупаются ${cardNameList(bestEpicCore, 5)}. Они чаще попадают в реальные списки и дают понятную игровую роль.`,
      mentions: bestEpicCore,
    });
  }

  if (bestEpicSupport.length > 0) {
    drafts.push({
      idSuffix: "best-epics-support",
      title: "Эпики для стабильных сборок",
      headline: "Второй эшелон",
      lead: `Эти эпики не всегда первые в очереди, но хорошо работают, если вы уже играете нужный класс или контрольную сборку.`,
      mentions: bestEpicSupport,
    });
  }

  if (situationalEpicCore.length > 0) {
    drafts.push({
      idSuffix: "situational-epics",
      title: "Ситуативные эпики",
      headline: "Не автокрафт",
      lead:
        "Финальная группа выглядит сильной на бумаге, но зависит от слабых или узких архетипов. Здесь крафт оправдан только под готовый план игры.",
      mentions: situationalEpicCore,
    });
  }

  if (otherCards.length > 0) {
    drafts.push({
      idSuffix: "other-cards",
      title: "Остальные упомянутые карты",
      headline: "Без пропусков",
      lead: `В статье есть еще несколько карт, которые нельзя терять из видеоряда: ${cardNameList(otherCards, 8)}. Для них оставляем быстрый монтаж, без лишнего пересказа, чтобы зритель видел весь список и понимал, где заканчивается основной приоритет.`,
      mentions: otherCards,
      shotType: "card_lineup",
      includeReasons: false,
    });
  }

  drafts.push({
    idSuffix: "verdict",
    title: "Финальный вердикт",
    headline: "Итог по пыли",
    lead:
      "Главное правило простое: сначала крафтите карты, которые открывают целую колоду, а не одиночные красивые легендарки. Если архетип вам не интересен, даже сильная карта легко превращается в дорогой запас на потом.",
    mentions: [...bestLegendaryCore.slice(0, 2), ...bestEpicCore.slice(0, 2), ...lastYear],
    beats: ["Крафт под колоду", "Ситуативное — после тестов"],
    includeReasons: false,
  });

  return drafts.filter((draft) => draft.lead || draft.mentions.length > 0);
};

const buildFallbackScenes = (article: ArticleData): DraftScene[] => {
  const sections = article.sections.length
    ? article.sections
    : [{ heading: "Главное", text: article.text }];

  return [
    {
      idSuffix: "intro",
      title: "Главное",
      headline: "Быстрый разбор",
      lead: shortLine(article.description || article.title, 260),
      mentions: [],
    },
    ...sections.slice(0, 5).map((section, index) => ({
      idSuffix: `section-${index + 1}`,
      title: section.heading,
      headline: shortLine(section.heading, 30),
      lead: shortLine(section.text, 320),
      mentions: [],
    })),
  ];
};

export const buildScenes = (
  article: ArticleData,
  options: BuildSceneOptions = {},
): VideoScene[] => {
  const targetMinutes = options.targetMinutes || DEFAULT_TARGET_MINUTES;
  const drafts =
    (article.cardMentions || []).length > 0
      ? buildCardScenes(article)
      : buildFallbackScenes(article);
  const scenes = drafts.map((draft, index) => makeScene(article, draft, index));

  return normalizeSceneDurations(scenes, targetMinutes);
};

const normalizeSceneDurations = (
  scenes: VideoScene[],
  targetMinutes: number,
): VideoScene[] => {
  const currentSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const maxTargetSeconds = Math.min(DEFAULT_MAX_MINUTES * 60, targetMinutes * 70);

  if (currentSeconds <= maxTargetSeconds) {
    return scenes;
  }

  const multiplier = maxTargetSeconds / Math.max(1, currentSeconds);
  return scenes.map((scene) => {
    const durationSeconds = Math.max(10, Math.round(scene.durationSeconds * multiplier));
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
    visualStyle: loadVisualStyle(),
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
