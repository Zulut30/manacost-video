# Hyperframes-first video workflow

## Installed skills

Use these local Codex skills after restarting Codex:

- `hyperframes-animation`: primary animation routing, atomic rules, transitions, GSAP/Three/Anime adapters.
- `hyperframes`, `hyperframes-core`, `hyperframes-cli`, `hyperframes-media`, `hyperframes-creative`, `hyperframes-registry`, `hyperframes-keyframes`.
- `embedded-captions`, `motion-graphics`, `faceless-explainer`, `general-video`, `slideshow`, `music-to-video`, `product-launch-video`, `website-to-video`.
- `remotion-to-hyperframes` only when explicitly porting Remotion source to Hyperframes.
- GSAP official skills: `gsap-core`, `gsap-timeline`, `gsap-performance`, `gsap-plugins`, `gsap-react`, `gsap-scrolltrigger`, `gsap-utils`, `gsap-frameworks`.

## Runtime libraries

The project has dependencies for animation experiments and future inserts:

- Remotion remains the final 2560x1440 YouTube render engine.
- Hyperframes is available for HTML/GSAP composition prototyping and rendering.
- GSAP is the default motion runtime for Hyperframes-like inserts.
- Three.js is reserved for real 3D scenes, camera moves, shader-driven card tables, and parallax rigs.
- Anime.js is reserved for lightweight timeline effects where GSAP is unnecessary.
- p5.js is reserved for procedural backgrounds, particle fields, or audio-reactive sketches.
- Motion Canvas is reserved for code/diagram-heavy explanatory scenes.

## Source references

- Hyperframes skills: `https://github.com/heygen-com/hyperframes/tree/main/skills`
- Hyperframes manifest: `https://github.com/heygen-com/hyperframes/blob/main/skills-manifest.json`
- Launch storyboard example: `https://github.com/heygen-com/hyperframes-launch-video/blob/main/STORYBOARD.md`
- ElevenLabs TTS best practices: `https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices`

## Storyboard standard

Before final render, every article video should have a compact storyboard:

1. Hook: what viewer sees in the first 5-8 seconds.
2. Beat table: start/end/duration, VO cue, visual treatment, card/art source.
3. Motion language: 2-4 atomic animation rules from `hyperframes-animation`.
4. Asset contract: real card art, article images, screenshots, or user-provided media only.
5. Subtitle treatment: short caption pages, active-word emphasis, no text covering cards.
6. QA checklist: no missing card assets, no stale audio hash, no blank frames, no unreadable cards.

## ElevenLabs text rules

Use ElevenLabs for final narration when `ELEVENLABS_API_KEY` is present.

- Keep sentences natural and short.
- Use punctuation to guide pace.
- Use `<break time="0.4s" />` to create deliberate pauses, but avoid overusing breaks.
- Normalize card names and game terms before TTS.
- Prefer `eleven_multilingual_v2` for Russian unless a later tested model performs better.
- Keep speed near 1.0; do not solve pacing by aggressively speeding up audio.
- Generate per-scene audio and cache by hash of text, voice id, model id, and settings.

## Build route

Default route for Manacost articles:

1. Parse article and card mentions.
2. Create a storyboard and scene shot types.
3. Resolve every mentioned card to HSData art.
4. Generate ElevenLabs voiceover.
5. Render in Remotion at 2560x1440.
6. QA with ffprobe, card coverage, audio hash, and sampled still frames.

Use Hyperframes when a scene needs richer HTML/GSAP motion than the current Remotion components provide:

1. Author the insert as a Hyperframes composition.
2. Run `npm run hf:lint`.
3. Run `npm run hf:inspect`.
4. Render the insert to video.
5. Import the rendered insert into Remotion as a real video asset.

Do not convert the whole Remotion project to Hyperframes unless explicitly requested. The practical architecture is Remotion as final assembly, Hyperframes as a high-quality motion-insert factory.
