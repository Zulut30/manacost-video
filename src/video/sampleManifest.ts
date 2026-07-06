import type { PipelineManifest } from "../pipeline/types";

export const sampleManifest: PipelineManifest = {
  version: 1,
  slug: "sample",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  article: {
    url: "https://hs-manacost.ru/",
    slug: "sample",
    title: "Manacost: тестовый ролик",
    description: "Черновой предпросмотр шаблона ролика.",
    text: "Тестовый ролик для проверки композиции.",
    sections: [],
    cardMentions: [],
    images: [],
  },
  target: {
    width: 2560,
    height: 1440,
    fps: 30,
    codec: "h264",
    minMinutes: 3,
    maxMinutes: 5,
  },
  visualStyle: {
    id: "sample-opendesign-wired",
    source: "local",
    designSystem: "wired",
    skill: "after-hours-editorial-template",
    palette: {
      background: "#050607",
      surface: "#101214",
      text: "#fff7df",
      muted: "rgba(255,255,255,0.66)",
      accents: ["#f0b744", "#58c7de", "#ef4d3f", "#9ee66e"],
      danger: "#ef4d3f",
    },
    motion: {
      pacing: "kinetic",
      cutsPerMinute: 42,
      cardCycleSeconds: [1.05, 2.1],
    },
  },
  voice: {
    provider: "none",
    modelId: "eleven_multilingual_v2",
  },
  music: {
    enabled: false,
    volume: 0.08,
  },
  assets: [],
  scenes: [
    {
      id: "sample-scene",
      title: "Тестовая сцена",
      narration:
        "Это тестовая сцена для проверки композиции, титров и общего визуального ритма.",
      onScreenText: "Тестовая сцена",
      keywords: ["hearthstone", "manacost"],
      assetIds: [],
      durationSeconds: 10,
      captions: [
        {
          text: "Это тестовая сцена для проверки композиции",
          startMs: 0,
          endMs: 5000,
          timestampMs: null,
          confidence: null,
        },
        {
          text: "титров и общего визуального ритма.",
          startMs: 5000,
          endMs: 10000,
          timestampMs: null,
          confidence: null,
        },
      ],
    },
  ],
  render: {
    warnings: [],
  },
};
