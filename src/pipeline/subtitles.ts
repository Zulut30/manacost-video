import type { Caption } from "@remotion/captions";
import { cleanText } from "./text";

export type CharacterAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number | null;
};

const splitWords = (text: string): string[] => {
  return cleanText(text).split(/\s+/u).filter(Boolean);
};

const cleanCaptionText = (text: string): string => {
  return cleanText(text)
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/(\(|\[|\{)\s+/gu, "$1")
    .replace(/\s+(\]|\)|\})/gu, "$1")
    .trim();
};

const chunkSubtitleText = (text: string): string[] => {
  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of splitWords(text)) {
    const next = [...current, word].join(" ");
    const mustBreak = /[.!?]$/u.test(word);
    if (current.length > 0 && (current.length >= 4 || next.length > 38)) {
      chunks.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }

    if (mustBreak && current.length > 0) {
      chunks.push(current.join(" "));
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks;
};

export const captionsFromText = (
  text: string,
  durationSeconds: number,
): Caption[] => {
  const chunks = chunkSubtitleText(text);
  if (chunks.length === 0) {
    return [];
  }

  const captions: Caption[] = [];
  const totalChars = chunks.join(" ").length;
  let elapsedMs = 0;

  for (const chunk of chunks) {
    const weight = chunk.length / Math.max(1, totalChars);
    const chunkDurationMs = Math.max(650, Math.round(durationSeconds * 1000 * weight));
    const endMs = Math.min(Math.round(durationSeconds * 1000), elapsedMs + chunkDurationMs);

    captions.push({
      text: cleanCaptionText(chunk),
      startMs: elapsedMs,
      endMs,
      timestampMs: null,
      confidence: null,
    });

    elapsedMs = endMs;
  }

  if (captions.length > 0) {
    captions[captions.length - 1].endMs = Math.round(durationSeconds * 1000);
  }

  return captions;
};

export const captionsFromCharacterAlignment = (
  alignment: CharacterAlignment | undefined,
  fallbackText: string,
  durationSeconds: number,
): Caption[] => {
  const words = wordsFromCharacterAlignment(alignment);
  if (words.length === 0) {
    return captionsFromText(fallbackText, durationSeconds);
  }

  return captionsFromWords(words, durationSeconds);
};

export const captionsFromWords = (
  words: WordTiming[],
  durationSeconds: number,
): Caption[] => {
  const validWords = words
    .map((word) => ({
      ...word,
      text: cleanCaptionText(word.text),
      startMs: Math.max(0, Math.round(word.startMs)),
      endMs: Math.max(0, Math.round(word.endMs)),
    }))
    .filter((word) => word.text && word.endMs > word.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (validWords.length === 0) {
    return [];
  }

  const captions: Caption[] = [];
  let current: WordTiming[] = [];
  const durationMs = Math.round(durationSeconds * 1000);

  const flush = () => {
    if (current.length === 0) {
      return;
    }

    const startMs = current[0].startMs;
    const endMs = Math.max(
      current[current.length - 1].endMs,
      startMs + Math.min(700, durationMs - startMs),
    );
    captions.push({
      text: cleanCaptionText(current.map((word) => word.text).join(" ")),
      startMs: Math.max(0, startMs),
      endMs: Math.min(durationMs, endMs),
      timestampMs: null,
      confidence:
        current.some((word) => typeof word.confidence === "number")
          ? average(current.map((word) => word.confidence).filter(isNumber))
          : null,
    });
    current = [];
  };

  for (const word of validWords) {
    const previous = current[current.length - 1];
    const nextText = cleanCaptionText([...current.map((item) => item.text), word.text].join(" "));
    const pauseMs = previous ? word.startMs - previous.endMs : 0;
    const sentenceBreak = previous ? /[.!?]$/u.test(previous.text) : false;
    const shouldFlush =
      current.length > 0 &&
      (current.length >= 5 || nextText.length > 44 || pauseMs >= 260 || sentenceBreak);

    if (shouldFlush) {
      flush();
    }

    current.push(word);
  }

  flush();

  return captions.filter((caption) => caption.endMs > caption.startMs);
};

export const wordsFromCharacterAlignment = (
  alignment: CharacterAlignment | undefined,
): WordTiming[] => {
  if (!alignment) {
    return [];
  }

  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const characters = alignment.characters || [];
  if (
    characters.length === 0 ||
    starts.length !== characters.length ||
    ends.length !== characters.length
  ) {
    return [];
  }

  const words: WordTiming[] = [];
  let text = "";
  let startMs: number | undefined;
  let endMs = 0;

  const flush = () => {
    const cleaned = cleanCaptionText(text);
    if (cleaned && startMs !== undefined && endMs > startMs) {
      words.push({ text: cleaned, startMs, endMs, confidence: null });
    }
    text = "";
    startMs = undefined;
    endMs = 0;
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] || "";
    const charStartMs = Math.round((starts[index] || 0) * 1000);
    const charEndMs = Math.round((ends[index] || starts[index] || 0) * 1000);

    if (/\s/u.test(character)) {
      flush();
      continue;
    }

    if (startMs === undefined) {
      startMs = charStartMs;
    }
    text += character;
    endMs = Math.max(endMs, charEndMs);
  }

  flush();
  return words;
};

export const toSrt = (captions: Caption[]): string => {
  return captions
    .map((caption, index) => {
      return [
        String(index + 1),
        `${formatSrtTime(caption.startMs)} --> ${formatSrtTime(caption.endMs)}`,
        caption.text,
      ].join("\n");
    })
    .join("\n\n");
};

const average = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const isNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const formatSrtTime = (ms: number): string => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(
    3,
    "0",
  )}`;
};

const pad = (value: number): string => String(value).padStart(2, "0");
