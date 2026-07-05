import { HSDATA_API_BASE } from "./constants";
import { ensureDir, readJson, writeJson } from "./fs";
import type { PipelineAsset } from "./types";
import path from "node:path";
import { PROJECT_ROOT } from "./constants";

type HsDataImageSet = {
  card?: string | null;
  crop?: string | null;
  art?: string | null;
  framed?: string | null;
  golden?: string | null;
  signature?: string | null;
  diamond?: string | null;
};

type HsDataCard = {
  card_id: string;
  dbf?: number;
  collectible?: boolean;
  name?: {
    ru?: string;
    en?: string;
  };
  text?: {
    ru?: string;
    en?: string;
  };
  text_ru?: string;
  card_set?: string;
  class?: string;
  rarity?: string;
  images?: HsDataImageSet;
  wiki_page?: {
    title?: string;
    url?: string;
  };
};

type HsDataResponse = {
  data?: HsDataCard[];
  pagination?: {
    page: number;
    total_pages: number;
    has_next: boolean;
  };
};

const CACHE_PATH = path.join(PROJECT_ROOT, ".cache", "hsdata-constructed.json");

const fetchJson = async (url: string): Promise<HsDataResponse | undefined> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as HsDataResponse;
  } catch {
    return undefined;
  }
};

const normalize = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
};

const GENERIC_QUERY_WORDS = new Set(
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
    "\u0434\u0440\u0430\u043a\u043e\u043d",
    "\u0434\u0440\u0430\u043a\u043e\u043d\u0430",
    "\u043f\u0438\u0442\u043e\u043c\u0435\u0446",
    "\u043f\u0438\u0442\u043e\u043c\u0446\u0430",
  ].map(normalize),
);

const loadConstructedCards = async (): Promise<HsDataCard[]> => {
  try {
    return readJson<HsDataCard[]>(CACHE_PATH);
  } catch {
    // Cache miss; fetch below.
  }

  const cards: HsDataCard[] = [];
  const seen = new Set<string>();

  for (const format of ["standard", "wild"]) {
    let page = 1;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({
        format,
        per_page: "200",
        page: String(page),
      });
      const json = await fetchJson(`${HSDATA_API_BASE}/constructed-cards?${params}`);
      for (const card of json?.data || []) {
        if (!card.card_id || seen.has(card.card_id)) {
          continue;
        }
        seen.add(card.card_id);
        cards.push(card);
      }

      totalPages = json?.pagination?.total_pages || page;
      page += 1;
    } while (page <= totalPages);
  }

  ensureDir(path.dirname(CACHE_PATH));
  writeJson(CACHE_PATH, cards);
  return cards;
};

const scoreCard = (card: HsDataCard, query: string): number => {
  const q = normalize(query);
  const qWords = q.split(" ").filter((word) => word.length > 3);
  const singleWordQuery = qWords.length === 1;
  if (!q || (singleWordQuery && GENERIC_QUERY_WORDS.has(qWords[0]))) {
    return 0;
  }

  const names = [card.name?.ru, card.name?.en, card.card_id]
    .filter(Boolean)
    .map((name) => normalize(String(name)));
  let score = 0;

  for (const name of names) {
    if (GENERIC_QUERY_WORDS.has(name)) {
      continue;
    }

    if (name === q) {
      score = Math.max(score, 100);
    } else if (
      !singleWordQuery &&
      name.length >= 5 &&
      (name.includes(q) || q.includes(name))
    ) {
      score = Math.max(score, 70 - Math.abs(name.length - q.length));
    } else {
      const hits = qWords.filter((word) => name.includes(word)).length;
      if (hits > 0) {
        score = Math.max(score, hits * 12);
      }
    }
  }

  if (card.collectible === false) {
    score -= 8;
  }

  return score;
};

export const searchConstructedCards = async (
  query: string,
  limit = 4,
): Promise<HsDataCard[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const cards = await loadConstructedCards();
  return cards
    .map((card) => ({ card, score: scoreCard(card, trimmed) }))
    .filter((entry) => entry.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.card);
};

export const hsCardToAssetDraft = (
  card: HsDataCard,
  index: number,
): Omit<PipelineAsset, "path" | "width" | "height" | "qualityScore"> & {
  imageUrl?: string;
  imageUrls?: string[];
} => {
  const imageUrls = [
    card.images?.card,
    card.images?.framed,
    card.images?.art,
    card.images?.crop,
  ].filter(Boolean) as string[];
  const imageUrl = imageUrls[0];
  const name = card.name?.ru || card.name?.en || card.card_id;
  const tags = [
    name,
    card.name?.en,
    card.card_set,
    card.class,
    card.rarity,
    card.card_id,
  ].filter(Boolean) as string[];

  return {
    id: `hsdata-${index + 1}-${card.card_id.toLowerCase()}`,
    kind: "image",
    role: "card",
    source: "hsdata",
    title: name,
    originalUrl: imageUrl,
    attribution: card.wiki_page?.url
      ? `HSData / Blizzard card art / ${card.wiki_page.url}`
      : "HSData / Blizzard card art",
    tags,
    imageUrl,
    imageUrls,
  };
};
