# Manacost Video Pipeline Fix Plan

## Goal

Build a reliable 3-5 minute YouTube pipeline for Manacost Hearthstone articles:

- output: 2560x1440, 30 fps, 3-5 minutes;
- no AI-generated pictures for the article visuals;
- exact Hearthstone cards and readable card presentation;
- dynamic video, not a static presentation;
- Russian voiceover that matches the actual script;
- burned-in dynamic subtitles plus exported SRT;
- Open Design-backed visual direction and motion references;
- automated QA that fails on stale audio, missing cards, bad resolution, and weak visual coverage.

## Current Baseline

Current test article baseline:

- article card mentions: 33;
- downloaded card assets: 33;
- generated scenes: 9;
- current manifest coverage for that article: no found cards are missing from scenes;
- lint/typecheck currently pass.

Main remaining problems:

- voiceover cache can reuse old MP3 files after narration changes;
- subtitles are estimated from text length, not aligned to real speech;
- script generation is still template-heavy and tuned to one article structure;
- parser can miss cards outside the primary tooltip paragraph format;
- hidden card/image caps can drop material in longer articles;
- article images are only used as wide backgrounds, not as editorial cutaways;
- QA checks media container properties, not video quality or content correctness;
- music is a temporary generated bed, not a curated license-safe track.

## Open Design Setup

Open Design is installed at:

```text
C:\Users\zulut\Documents\open-design
```

Daemon:

```text
http://127.0.0.1:7456
```

Verified:

- health: ok, version 0.12.1;
- skills registry: 161 skills;
- design systems registry: 150 design systems;
- Open Design sees Codex CLI and Claude Code as available, both auth ok;
- Codex MCP config contains `open-design` and is enabled.

Important note:

- the current Codex session may need a restart/new thread before the new Open Design MCP tools appear in the tool list;
- until then, the daemon can be used through HTTP/CLI.

## Open Design Direction For This Project

Recommended Open Design sources:

- `after-hours-editorial-template`: premium dark editorial storyboard rhythm;
- `frame-light-leak-cinema`: cinematic chapter cards and transitions;
- `frame-glitch-title`: short impact transitions for meta swings or "do not craft" moments;
- `frame-data-chart-nyt`: clean tier/priority boards for craft recommendations;
- `deck-swiss-international`: strict grid discipline for readable information;
- `gpt-taste`, `gsap-performance`: motion taste and performance constraints.

Recommended design systems:

- `WIRED`: sharp media/editorial energy;
- `The Verge`: colorful tech/media rhythm;
- `Dramatic`: high-contrast punch for YouTube retention;
- `Editorial`: disciplined type and layout;
- `Atelier Zero`: premium editorial restraint;
- `PlayStation`: optional gaming-adjacent accent reference, not a brand copy.

Pipeline integration:

- add a `visualStyle` block to the manifest:
  - `designSystemId`;
  - `motionPreset`;
  - `palette`;
  - `typeScale`;
  - `shotDensity`;
  - `transitionStyle`;
  - `subtitleStyle`;
- add CLI option `--style <id>` with default `wired-dramatic`;
- store the chosen Open Design references in `render-report.json`;
- generate still-frame QA against that style.

## Phase 1 - Stop Stale Voiceover Bugs

Priority: P1.

Problem:

The MP3 path is based only on `scene.id`, so changed narration can reuse old audio.

Implementation:

- compute `narrationHash = sha256(scene.narration + voiceId + modelId + voiceSettings)`;
- save audio as `scene-id.narrationHash.mp3` or store a sidecar metadata file;
- if existing audio metadata hash differs, regenerate automatically;
- write `voiceover-manifest.json` with:
  - scene id;
  - narration hash;
  - voice id;
  - model id;
  - generated file;
  - duration;
  - generatedAt;
- add CLI command:
  - `npm.cmd run voiceover -- <slug> --force`;
  - `npm.cmd run voiceover -- <slug> --clean-stale`;
- fail render if a scene has `audioPath` but hash does not match current narration.

Acceptance criteria:

- changing one word in narration regenerates that scene audio;
- unchanged scenes keep cached MP3;
- final render cannot use audio from an older script;
- QA report explicitly says `voiceoverCache: valid`.

## Phase 2 - Real Subtitle Timing

Priority: P1.

Problem:

Captions are estimated by text length and scene duration. They can drift from real speech.

Implementation:

- keep current heuristic only as fallback;
- after MP3 generation, run alignment:
  - preferred: TTS provider alignment if available for the chosen account/model;
  - fallback: local ASR alignment with Whisper/faster-whisper/whisper.cpp;
- generate word-level or phrase-level timestamps;
- keep short subtitle chunks:
  - 2-5 words;
  - max 38 characters;
  - no long sentence blocks;
- export:
  - burned-in captions for Remotion;
  - global `subtitles.srt`;
  - `captions.json` with scene-local and global times;
- add QA drift check by comparing audio duration, caption end, and silence gaps.

Acceptance criteria:

- subtitles start/end near actual speech, target drift under 300-500 ms;
- no local-scene timestamps leak into global SRT;
- subtitles never cover the active card name or important card stats;
- every scene has non-empty captions unless explicitly muted.

## Phase 3 - Card Extraction And Coverage

Priority: P1.

Problem:

Parser is accurate for the current guide but too narrow for other Manacost layouts.

Implementation:

- extend DOM parsing beyond `h2,h3,p,li,blockquote`:
  - tables;
  - deck widgets;
  - image captions;
  - card galleries;
  - nested card tooltip blocks;
- collect all `.hs-card-tooltip` nodes first, then classify primary/secondary roles;
- preserve section context for every card:
  - heading;
  - paragraph text;
  - nearby list/table row;
  - category;
  - reason text;
- validate every detected card through HSData by exact `cardId` first, then name;
- never use fuzzy fallback for explicit card scenes unless confidence is high;
- remove hard cap of 40 cards or turn it into a visible CLI option;
- write `coverage-report.json`:
  - detected cards;
  - matched assets;
  - cards used in scenes;
  - skipped cards with reason;
  - unmatched cards.

Acceptance criteria:

- QA fails when a detected card is not in any scene and has no explicit skip reason;
- wrong-card fuzzy matches are blocked;
- long articles do not silently drop card 41+;
- report is readable enough to debug card misses quickly.

## Phase 4 - Editorial Script Engine

Priority: P1.

Problem:

The current script is still closer to templated summary than a YouTube segment.

Implementation:

- replace fixed category text with a structured editorial model:
  - hook;
  - context;
  - card group;
  - why it matters;
  - craft verdict;
  - risk/counterpoint;
  - transition to next group;
- generate per-card beats:
  - `cardName`;
  - `verdict`: craft / wait / niche / dust-safe;
  - `reason`;
  - `deck/archetype`;
  - `visualPriority`;
  - `mustShowSeconds`;
- enforce 3-5 minute budget:
  - target 210-270 seconds;
  - intro 12-18 seconds;
  - 6-9 content scenes;
  - outro 10-16 seconds;
- remove generic filler and service explanations;
- make "do not craft" moments punchier and shorter.

Acceptance criteria:

- narration only mentions cards actually present in article/card data;
- every visual scene has a clear reason to exist;
- no repeated narrator lines between runs unless the article truly repeats;
- the script can be reviewed as `script.md` with card IDs beside names.

## Phase 5 - Dynamic Shot Engine

Priority: P1.

Problem:

The video still risks feeling like a presentation.

Implementation:

Add shot types:

- `hook_montage`: fast 5-8 card flashes, article title, strong verdict;
- `card_lineup`: horizontal/diagonal card fan with active focus;
- `card_spotlight`: one readable card, large enough to inspect;
- `pair_compare`: two cards side by side with craft/wait labels;
- `tier_stack`: top cards ranked by priority;
- `archetype_board`: cards grouped by deck/archetype;
- `warning_cut`: red/orange "wait" moment with quick glitch transition;
- `article_cutaway`: screenshot or original article image as context, not background filler;
- `verdict_wall`: final craft list with all important cards visible.

Rules:

- never stretch a card as full-screen background;
- card face must be readable in spotlight shots;
- if a card is too small, use art crop plus separate readable card overlay;
- no white bars from source images;
- show all important cards at least once in a large state;
- change active visual every 2.5-4 seconds;
- add micro-motion every 8-14 frames on transitions;
- use transitions as punctuation, not constant noise.

Acceptance criteria:

- at least 10-14 meaningful visual changes per minute;
- every important card appears in a readable size at least once;
- no scene is just static text plus static card;
- screenshots/stills show no unreadably tiny card cluster.

## Phase 6 - Remotion Visual Refactor

Priority: P2.

Implementation:

- split `ArticleVideo.tsx` into composable parts:
  - `VideoShell`;
  - `SceneTimeline`;
  - `ShotRenderer`;
  - `CardSpotlight`;
  - `CardLineup`;
  - `TierStack`;
  - `SubtitleLayer`;
  - `MotionBackground`;
  - `ChapterTransition`;
- move animation constants to `motionTokens.ts`;
- move style constants to `visualStyles.ts`;
- add Open Design-driven style presets;
- add deterministic randomization by scene/card id for variety without instability;
- add safe text-fit helpers for Russian card names and subtitles.

Acceptance criteria:

- no oversized component with unrelated layout logic;
- style can be changed by one manifest field;
- still renders are deterministic between runs;
- text never overflows subtitle box/card labels.

## Phase 7 - Article Images And Asset Quality

Priority: P2.

Implementation:

- classify article images into:
  - background;
  - screenshot;
  - inline illustration;
  - card image fallback;
  - discard;
- use non-wide article images as framed cutaways, not backgrounds;
- detect white bars/borders:
  - crop transparent/white margins when safe;
  - reject bad assets if crop would damage card;
- keep asset quality metadata:
  - source;
  - dimensions;
  - aspect;
  - crop;
  - role;
  - confidence.

Acceptance criteria:

- article screenshots can appear as editorial evidence;
- no white stripe artifacts in final stills;
- low-quality assets are marked in report and do not dominate a scene.

## Phase 8 - Music And Sound Design

Priority: P2.

Implementation:

- replace FFmpeg sine/noise bed with a license-safe music folder:
  - `assets/music/`;
  - `music.json` with title, license, source, bpm, mood;
- add CLI option `--music <track-id>`;
- add voice ducking:
  - lower music under voice;
  - short risers/hits for transitions;
  - no SFX over important card names;
- keep generated placeholder only for dry-run.

Acceptance criteria:

- every used music file has license/source metadata;
- voice remains intelligible;
- render report includes music attribution.

## Phase 9 - Automated QA

Priority: P1/P2.

Implementation:

Add `qa:content`:

- card coverage check;
- stale voiceover hash check;
- subtitle duration/timing check;
- scene duration budget check;
- no missing files;
- no wrong resolution/FPS/audio stream.

Add `qa:visual`:

- render stills at key frames;
- check blank/near-blank frames;
- check card bounding boxes are not tiny in spotlight shots;
- check subtitles do not overlap the main card area;
- optional OCR/text overflow pass for Russian subtitles.

Add `qa:preview`:

- create preview contact sheet;
- write a human-readable HTML/PNG report.

Acceptance criteria:

- final render cannot be marked ok with missing cards or stale audio;
- preview report makes it obvious where weak scenes are;
- QA runs before push.

## Phase 10 - CLI And Workflow

Priority: P2.

Commands to add:

```powershell
npm.cmd run analyze -- "<url>"
npm.cmd run storyboard -- "<slug>"
npm.cmd run voiceover -- "<slug>" --clean-stale
npm.cmd run render -- "<slug>"
npm.cmd run qa -- "<slug>"
npm.cmd run preview-contact-sheet -- "<slug>"
```

Useful flags:

```text
--style wired-dramatic
--target-minutes 4
--force-assets
--force-voiceover
--clean-stale
--music none|track-id
--strict-card-coverage
```

Acceptance criteria:

- one command can still generate the whole video;
- each stage is inspectable and rerunnable;
- failed QA exits non-zero;
- output folder contains enough reports to debug without reading code.

## Implementation Order

1. Voiceover hash cache and stale-audio QA.
2. Card coverage report and strict coverage QA.
3. Real subtitle alignment path.
4. Script engine refactor to per-card editorial beats.
5. Shot engine and Remotion component split.
6. Open Design style presets.
7. Article image classification and crop cleanup.
8. Music metadata and ducking.
9. Visual contact sheet QA.
10. Full render of the craft article and push.

## Definition Of Done

A generated video is acceptable only when:

- duration is 3-5 minutes;
- resolution is 2560x1440;
- all detected important cards are shown;
- no wrong cards are used;
- voiceover matches current script hash;
- subtitles are aligned and readable;
- at least one preview contact sheet is reviewed;
- no card is used as full-screen stretched background;
- no white stripe card artifacts are visible;
- render report has zero critical warnings;
- final MP4 and manifest are produced from the same current run.
