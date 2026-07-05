import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { cleanText, makeSlug } from "./text";
import type { ArticleData, ArticleImage, ArticleSection } from "./types";

const getMeta = (document: Document, selectors: string[]): string | undefined => {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const content = node?.getAttribute("content") || node?.textContent;
    if (content && cleanText(content).length > 0) {
      return cleanText(content);
    }
  }

  return undefined;
};

const resolveUrl = (url: string, baseUrl: string): string | undefined => {
  try {
    if (!url || url.startsWith("data:")) {
      return undefined;
    }
    return new URL(url, baseUrl).toString();
  } catch {
    return undefined;
  }
};

const getImageUrl = (element: Element, baseUrl: string): string | undefined => {
  const candidates = [
    element.getAttribute("data-src"),
    element.getAttribute("data-lazy-src"),
    element.getAttribute("data-original"),
    element.getAttribute("src"),
  ].filter(Boolean) as string[];

  const srcset = element.getAttribute("srcset");
  if (srcset) {
    const largest = srcset
      .split(",")
      .map((item) => item.trim().split(/\s+/u)[0])
      .filter(Boolean)
      .at(-1);
    if (largest) {
      candidates.unshift(largest);
    }
  }

  for (const candidate of candidates) {
    const resolved = resolveUrl(candidate, baseUrl);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
};

const collectImages = (
  document: Document,
  articleDocument: Document,
  baseUrl: string,
): ArticleImage[] => {
  const seen = new Set<string>();
  const images: ArticleImage[] = [];

  const add = (
    url: string | undefined,
    alt?: string,
    width?: number,
    height?: number,
  ) => {
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    images.push({
      id: `article-image-${images.length + 1}`,
      url,
      alt: alt ? cleanText(alt) : undefined,
      width,
      height,
    });
  };

  add(getMeta(document, ['meta[property="og:image"]']), "Open Graph image");

  for (const img of articleDocument.querySelectorAll("img")) {
    const url = getImageUrl(img, baseUrl);
    const width = Number(img.getAttribute("width") || 0) || undefined;
    const height = Number(img.getAttribute("height") || 0) || undefined;
    add(url, img.getAttribute("alt") || undefined, width, height);
  }

  return images.filter((image) => !/avatar|emoji|logo|counter|pixel/iu.test(image.url));
};

const collectSections = (articleDocument: Document): ArticleSection[] => {
  const sections: ArticleSection[] = [];
  let current: ArticleSection = { heading: "Главное", text: "" };

  for (const node of Array.from(
    articleDocument.querySelectorAll("h2,h3,p,li,blockquote"),
  )) {
    const tagName = node.tagName.toLowerCase();
    const text = cleanText(node.textContent || "");
    if (!text) {
      continue;
    }

    if (tagName === "h2" || tagName === "h3") {
      if (current.text.length > 0) {
        sections.push(current);
      }
      current = { heading: text, text: "" };
      continue;
    }

    current.text = cleanText(`${current.text} ${text}`);
  }

  if (current.text.length > 0) {
    sections.push(current);
  }

  return sections.filter((section) => section.text.length > 80);
};

export const fetchArticle = async (url: string): Promise<ArticleData> => {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "ManacostVideoPipeline/1.0 (+https://hs-manacost.ru; article video generator)",
    },
  });

  if (!response.ok) {
    throw new Error(`Article request failed: ${response.status} ${url}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const readable = new Readability(dom.window.document).parse();
  const articleHtml = readable?.content || dom.window.document.body.innerHTML;
  const articleDom = new JSDOM(articleHtml, { url });
  const articleDocument = articleDom.window.document;

  const title =
    cleanText(readable?.title || "") ||
    getMeta(dom.window.document, ['meta[property="og:title"]', "title"]) ||
    new URL(url).pathname;
  const description =
    readable?.excerpt ||
    getMeta(dom.window.document, [
      'meta[name="description"]',
      'meta[property="og:description"]',
    ]);
  const siteName = getMeta(dom.window.document, ['meta[property="og:site_name"]']);
  const author = getMeta(dom.window.document, [
    'meta[name="author"]',
    'meta[property="article:author"]',
  ]);
  const publishedAt = getMeta(dom.window.document, [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
  ]);
  const sections = collectSections(articleDocument);
  const text =
    cleanText(readable?.textContent || "") ||
    cleanText(sections.map((section) => section.text).join(" "));

  return {
    url,
    slug: makeSlug(title),
    title,
    description,
    siteName,
    author,
    publishedAt,
    text,
    sections,
    images: collectImages(dom.window.document, articleDocument, url),
  };
};
