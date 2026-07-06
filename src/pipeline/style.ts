import fs from "node:fs";
import path from "node:path";
import type { VisualStyleConfig } from "./types";

export const defaultOpenDesignVisualStyle: VisualStyleConfig = {
  id: "opendesign-wired-kinetic-v1",
  source: "open-design",
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
};

export const loadVisualStyle = (): VisualStyleConfig => {
  const stylePath = process.env.OPEN_DESIGN_STYLE_PATH;
  if (!stylePath) {
    return defaultOpenDesignVisualStyle;
  }

  const resolvedPath = path.resolve(stylePath);
  if (!fs.existsSync(resolvedPath)) {
    return defaultOpenDesignVisualStyle;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as Partial<VisualStyleConfig>;
    return {
      ...defaultOpenDesignVisualStyle,
      ...parsed,
      palette: {
        ...defaultOpenDesignVisualStyle.palette,
        ...(parsed.palette || {}),
      },
      motion: {
        ...defaultOpenDesignVisualStyle.motion,
        ...(parsed.motion || {}),
      },
    };
  } catch {
    return defaultOpenDesignVisualStyle;
  }
};
