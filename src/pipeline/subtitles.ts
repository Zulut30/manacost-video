import type { Caption } from "@remotion/captions";
import { cleanText } from "./text";

const splitWords = (text: string): string[] => {
  return cleanText(text).split(/\s+/u).filter(Boolean);
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
      text: chunk,
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
