import slugify from "slugify";

const SENTENCE_RE = /[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu;
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’_-]{2,}/gu;

const STOP_WORDS = new Set([
  "это",
  "как",
  "для",
  "что",
  "или",
  "при",
  "уже",
  "если",
  "будет",
  "можно",
  "которые",
  "который",
  "карты",
  "карта",
  "колода",
  "колоды",
  "hearthstone",
  "manacost",
  "читать",
  "обновлено",
  "подробнее",
]);

export const cleanText = (value: string): string => {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/Реклама|Читайте также|Подписывайтесь/giu, "")
    .trim();
};

export const makeSlug = (value: string): string => {
  const slug = slugify(value, {
    lower: true,
    strict: true,
    locale: "ru",
  });

  return slug || `article-${Date.now()}`;
};

export const splitSentences = (value: string): string[] => {
  return Array.from(cleanText(value).matchAll(SENTENCE_RE))
    .map((match) => cleanText(match[0]))
    .filter((sentence) => sentence.length > 24);
};

export const clampText = (value: string, maxChars: number): string => {
  const clean = cleanText(value);
  if (clean.length <= maxChars) {
    return clean;
  }

  const sentences = splitSentences(clean);
  const picked: string[] = [];
  let total = 0;

  for (const sentence of sentences) {
    if (total + sentence.length > maxChars) {
      break;
    }
    picked.push(sentence);
    total += sentence.length + 1;
  }

  return picked.length > 0 ? picked.join(" ") : `${clean.slice(0, maxChars)}...`;
};

export const estimateSpeechSeconds = (text: string): number => {
  const words = Array.from(cleanText(text).matchAll(WORD_RE)).length;
  const secondsByWords = (words / 125) * 60;
  const secondsByChars = cleanText(text).length / 13.5;
  return Math.max(8, Math.round(Math.max(secondsByWords, secondsByChars)));
};

export const extractKeywords = (
  values: string[],
  limit = 18,
): string[] => {
  const counts = new Map<string, number>();

  for (const value of values) {
    for (const match of cleanText(value).matchAll(WORD_RE)) {
      const word = match[0].toLowerCase();
      if (word.length < 4 || STOP_WORDS.has(word)) {
        continue;
      }
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([word]) => word);
};

export const extractTitlePhrases = (value: string, limit = 12): string[] => {
  const phrases = cleanText(value)
    .split(/[,:;()«»"“”\-–—|]+/u)
    .map((part) => cleanText(part))
    .filter((part) => part.length >= 4 && part.length <= 42);

  return Array.from(new Set(phrases)).slice(0, limit);
};

export const extractNamedPhrases = (value: string, limit = 32): string[] => {
  const ignored = new Set([
    "лучшие",
    "ситуативные",
    "часто",
    "сейчас",
    "также",
    "добавлены",
    "стандарте",
    "колода",
    "классовых",
  ]);
  const counts = new Map<string, number>();
  const matches = Array.from(
    cleanText(value).matchAll(/\p{Lu}[\p{Ll}’'-]+(?:[\s,]+\p{Lu}[\p{Ll}’'-]+){0,4}/gu),
  );

  for (const match of matches) {
    const phrase = cleanText(match[0].replace(/[,.!?;:]+$/u, ""));
    const normalized = phrase.toLowerCase();
    if (
      phrase.length < 5 ||
      ignored.has(normalized) ||
      /\b(?:карты|карта|гайд|релиз|год)\b/iu.test(phrase)
    ) {
      continue;
    }
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([phrase]) => phrase)
    .slice(0, limit);
};
