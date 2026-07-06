import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  PipelineAsset,
  PipelineManifest,
  VideoScene,
} from "../pipeline/types";

export type ArticleVideoProps = {
  manifest: PipelineManifest;
};

export const calculateArticleVideoMetadata: CalculateMetadataFunction<
  ArticleVideoProps
> = ({ props }) => {
  const fps = props.manifest.target.fps;
  const durationInSeconds = props.manifest.scenes.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0,
  );

  return {
    width: props.manifest.target.width,
    height: props.manifest.target.height,
    fps,
    durationInFrames: Math.ceil(durationInSeconds * fps),
    defaultOutName: `${props.manifest.slug}-2k`,
  };
};

export const ArticleVideo: React.FC<ArticleVideoProps> = ({ manifest }) => {
  const { fps } = useVideoConfig();
  let from = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050505", overflow: "hidden" }}>
      {manifest.music.enabled && manifest.music.path ? (
        <Audio
          src={staticFile(manifest.music.path)}
          volume={() => manifest.music.volume}
          loop
        />
      ) : null}

      {manifest.scenes.map((scene, index) => {
        const durationInFrames = Math.max(1, Math.ceil(scene.durationSeconds * fps));
        const sequence = (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <SceneView
              manifest={manifest}
              scene={scene}
              sceneIndex={index}
              durationInFrames={durationInFrames}
            />
            {scene.audioPath ? (
              <Audio src={staticFile(scene.audioPath)} volume={() => 1} />
            ) : null}
          </Sequence>
        );
        from += durationInFrames;
        return sequence;
      })}
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{
  manifest: PipelineManifest;
  scene: VideoScene;
  sceneIndex: number;
  durationInFrames: number;
}> = ({ manifest, scene, sceneIndex, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneAssets = scene.assetIds
    .map((id) => manifest.assets.find((asset) => asset.id === id))
    .filter(Boolean) as PipelineAsset[];
  const backgroundAsset = sceneAssets.find(isUsableBackgroundAsset);
  const orderedForegroundAssets = sceneAssets.filter(
    (asset) => asset.kind === "image" && asset.id !== backgroundAsset?.id,
  );
  const hasExplicitCards =
    (scene.cardIds?.length || 0) > 0 || (scene.cardNames?.length || 0) > 0;
  const foregroundAssets = hasExplicitCards
    ? orderedForegroundAssets
    : [...orderedForegroundAssets].sort((a, b) => visualPriority(b) - visualPriority(a));
  const activeVisualIndex = getActiveVisualIndex(
    foregroundAssets.length,
    frame,
    durationInFrames,
    fps,
  );
  const activeVisualAsset = foregroundAssets[activeVisualIndex];
  const accent = sceneIndex % 2 === 0 ? "#f0b744" : "#58c7de";
  const fadeIn = interpolate(frame, [0, fps * 0.65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headline = getSceneHeadline(scene);
  const beats = getSceneBeats(scene);

  return (
    <AbsoluteFill>
      <VisualBackground
        asset={backgroundAsset || activeVisualAsset}
        progress={progress}
        sceneIndex={sceneIndex}
        isCardBackground={!backgroundAsset && Boolean(activeVisualAsset)}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(2,3,4,0.92) 0%, rgba(2,3,4,0.76) 46%, rgba(2,3,4,0.28) 100%)",
        }}
      />
      <AccentRails accent={accent} progress={progress} />
      <SceneImpact
        accent={accent}
        frame={frame}
        fps={fps}
        sceneIndex={sceneIndex}
        headline={headline}
      />

      <div
        style={{
          position: "absolute",
          left: 136,
          top: 124,
          width: 1120,
          opacity: fadeIn,
          transform: `translateY(${(1 - fadeIn) * 26}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 58,
          }}
        >
          <div
            style={{
              width: 88,
              height: 5,
              backgroundColor: accent,
            }}
          />
          <div
            style={{
            color: "#f6d58a",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 0,
              textTransform: "uppercase",
            }}
          >
            Manacost
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.42)",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            {String(sceneIndex + 1).padStart(2, "0")}
          </div>
        </div>

        <h1
          style={{
            margin: 0,
            color: "#fff7df",
            fontSize: headline.length > 24 ? 112 : 142,
            lineHeight: 0.95,
            fontWeight: 900,
            letterSpacing: 0,
            maxWidth: 1040,
            textShadow: "0 12px 42px rgba(0,0,0,0.70)",
          }}
        >
          {headline}
        </h1>

        <div
          style={{
            marginTop: 66,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 860,
          }}
        >
          {beats.slice(0, 2).map((beat, index) => (
            <div
              key={beat}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                opacity: interpolate(
                  frame,
                  [(0.55 + index * 0.18) * fps, (0.95 + index * 0.18) * fps],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  backgroundColor: accent,
                  transform: "rotate(45deg)",
                }}
              />
              <div
                style={{
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 42,
                  lineHeight: 1.15,
                  fontWeight: 760,
                }}
              >
                {beat}
              </div>
            </div>
          ))}
        </div>
      </div>

      <CinematicVisuals
        assets={foregroundAssets}
        accent={accent}
        progress={progress}
        frame={frame}
        fps={fps}
        durationInFrames={durationInFrames}
        activeIndex={activeVisualIndex}
        sceneTitle={scene.title}
      />
      <AnimatedSubtitles
        scene={scene}
        frame={frame}
        fps={fps}
        accent={accent}
      />
      <ProgressBar progress={progress} accent={accent} />
    </AbsoluteFill>
  );
};

const getSceneHeadline = (scene: VideoScene): string => {
  return scene.headline || scene.onScreenText || scene.title;
};

const getSceneBeats = (scene: VideoScene): string[] => {
  if (scene.beats && scene.beats.length > 0) {
    return scene.beats;
  }

  const words = scene.narration.split(/\s+/u).filter(Boolean);
  const first = words.slice(0, 7).join(" ");
  const second = words.slice(7, 14).join(" ");
  return [first, second].filter(Boolean);
};

const assetAspect = (asset: Pick<PipelineAsset, "width" | "height">): number => {
  if (!asset.width || !asset.height) {
    return 0;
  }
  return asset.width / asset.height;
};

const isUsableBackgroundAsset = (asset: PipelineAsset): boolean => {
  const aspect = assetAspect(asset);
  const pixels = (asset.width || 0) * (asset.height || 0);

  return (
    (asset.role === "hero" || asset.role === "background") &&
    aspect >= 1.35 &&
    aspect <= 2.4 &&
    pixels >= 900 * 500
  );
};

const visualPriority = (asset: PipelineAsset): number => {
  const aspect = assetAspect(asset);
  const isCardShaped = aspect >= 0.55 && aspect <= 1.05 ? 1 : 0;
  const sourceBoost = asset.source === "hsdata" ? 0.8 : 0;
  const articlePenalty = asset.source === "article" ? 1 : 0;

  return asset.qualityScore + isCardShaped * 0.2 + sourceBoost - articlePenalty;
};

const VisualBackground: React.FC<{
  asset?: PipelineAsset;
  progress: number;
  sceneIndex: number;
  isCardBackground?: boolean;
}> = ({ asset, progress, sceneIndex, isCardBackground = false }) => {
  const scale = isCardBackground ? 3.1 + progress * 0.24 : 1.05 + progress * 0.08;
  const x = (sceneIndex % 3) * 16 - progress * 38;
  const y = sceneIndex % 2 === 0 ? progress * -14 : progress * 14;

  if (!asset) {
    return <DesignedBackdrop progress={progress} sceneIndex={sceneIndex} />;
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={staticFile(asset.path)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          transform: `scale(${scale}) translate(${x}px, ${y}px)`,
          filter: isCardBackground
            ? "blur(34px) saturate(1.18) contrast(1.12) brightness(0.34)"
            : "saturate(1.08) contrast(1.06) brightness(0.72)",
          opacity: isCardBackground ? 0.58 : 1,
        }}
      />
      {isCardBackground ? (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at 72% 42%, rgba(0,0,0,0.18), rgba(0,0,0,0.82) 62%), linear-gradient(90deg, rgba(0,0,0,0.82), rgba(0,0,0,0.24))",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const DesignedBackdrop: React.FC<{
  progress: number;
  sceneIndex: number;
}> = ({ progress, sceneIndex }) => {
  const drift = progress * 58;

  return (
    <AbsoluteFill
      style={{
        background:
          sceneIndex % 2 === 0
            ? "linear-gradient(135deg, #050607 0%, #151414 50%, #091319 100%)"
            : "linear-gradient(135deg, #050607 0%, #171107 48%, #0e1419 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.12,
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.10) 1px, transparent 1px)",
          backgroundSize: "108px 108px",
          transform: `translateX(${-drift}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1320,
          top: -180,
          width: 560,
          height: 1880,
          background:
            "linear-gradient(180deg, rgba(240,183,68,0.18), rgba(88,199,222,0.08))",
          transform: `rotate(18deg) translateY(${progress * 54}px)`,
          opacity: 0.8,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1980,
          top: -280,
          width: 170,
          height: 1900,
          backgroundColor: "rgba(255,255,255,0.07)",
          transform: `rotate(18deg) translateY(${progress * -42}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

const AccentRails: React.FC<{
  accent: string;
  progress: number;
}> = ({ accent, progress }) => {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 14,
          height: "100%",
          backgroundColor: accent,
          opacity: 0.78,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${18 + progress * 18}%`,
          height: 7,
          backgroundColor: accent,
          opacity: 0.95,
        }}
      />
    </>
  );
};

const SceneImpact: React.FC<{
  accent: string;
  frame: number;
  fps: number;
  sceneIndex: number;
  headline: string;
}> = ({ accent, frame, fps, sceneIndex, headline }) => {
  const opacity = interpolate(frame, [0, 0.08 * fps, 0.46 * fps], [0, 0.72, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const slide = interpolate(frame, [0, 0.42 * fps], [-360, 260], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const numberScale = interpolate(frame, [0, 0.22 * fps], [0.88, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(255,255,255,0.10)",
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: slide,
          top: -140,
          width: 420,
          height: 1720,
          backgroundColor: accent,
          transform: "rotate(16deg)",
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 130,
          bottom: 176,
          color: "rgba(255,247,223,0.90)",
          fontSize: 152,
          lineHeight: 0.82,
          fontWeight: 950,
          letterSpacing: 0,
          transform: `scale(${numberScale})`,
          textShadow: "0 30px 80px rgba(0,0,0,0.70)",
        }}
      >
        {String(sceneIndex + 1).padStart(2, "0")}
      </div>
      <div
        style={{
          position: "absolute",
          left: 370,
          bottom: 190,
          maxWidth: 780,
          color: "#fff7df",
          fontSize: 52,
          lineHeight: 0.95,
          fontWeight: 920,
          textTransform: "uppercase",
          textShadow: "0 18px 54px rgba(0,0,0,0.70)",
        }}
      >
        {headline}
      </div>
    </AbsoluteFill>
  );
};

const AnimatedSubtitles: React.FC<{
  scene: VideoScene;
  frame: number;
  fps: number;
  accent: string;
}> = ({ scene, frame, fps, accent }) => {
  const caption = scene.captions.find((item) => {
    const startFrame = Math.floor((item.startMs / 1000) * fps);
    const endFrame = Math.ceil((item.endMs / 1000) * fps);
    return frame >= startFrame && frame < endFrame;
  });

  if (!caption) {
    return null;
  }

  const startFrame = Math.floor((caption.startMs / 1000) * fps);
  const endFrame = Math.max(startFrame + 1, Math.ceil((caption.endMs / 1000) * fps));
  const localFrame = frame - startFrame;
  const framesLeft = endFrame - frame;
  const enter = interpolate(localFrame, [0, 0.22 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const exit = interpolate(framesLeft, [0, 0.18 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const words = caption.text.split(/\s+/u).filter(Boolean);
  const activeWordIndex = Math.min(
    words.length - 1,
    Math.max(0, Math.floor(progress * words.length)),
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 128,
        bottom: 78,
        width: 1500,
        minHeight: 132,
        padding: "26px 34px 28px",
        backgroundColor: "rgba(0,0,0,0.80)",
        borderLeft: `9px solid ${accent}`,
        boxShadow: "0 26px 80px rgba(0,0,0,0.58)",
        opacity,
        transform: `translateY(${(1 - enter) * 32}px) scale(${0.985 + enter * 0.015})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: `${Math.round(progress * 10000) / 100}%`,
          height: 5,
          backgroundColor: accent,
        }}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 14px",
          alignItems: "center",
          color: "#fff7df",
          fontSize: 64,
          lineHeight: 1,
          fontWeight: 930,
          letterSpacing: 0,
          textTransform: "uppercase",
          textShadow: "0 12px 34px rgba(0,0,0,0.70)",
        }}
      >
        {words.map((word, index) => {
          const isActive = index === activeWordIndex;
          const hasPassed = index < activeWordIndex;
          return (
            <span
              key={`${word}-${index}`}
              style={{
                color: isActive ? accent : hasPassed ? "rgba(255,247,223,0.72)" : "#fff7df",
                transform: `translateY(${isActive ? -4 : 0}px) scale(${isActive ? 1.06 : 1})`,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const CinematicVisuals: React.FC<{
  assets: PipelineAsset[];
  accent: string;
  progress: number;
  frame: number;
  fps: number;
  durationInFrames: number;
  activeIndex: number;
  sceneTitle: string;
}> = ({ assets, accent, progress, frame, fps, durationInFrames, activeIndex, sceneTitle }) => {
  if (assets.length === 0) {
    return null;
  }

  const featured = assets[activeIndex];
  const featuredAspect = assetAspect(featured);
  const featuredIsWide = featuredAspect > 1.18;
  const cardCycleFrames = getCardCycleFrames(assets.length, durationInFrames, fps);
  const cycleFrame = frame % cardCycleFrames;
  const reveal = interpolate(cycleFrame, [0, 0.22 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const swipe = interpolate(cycleFrame, [0, 0.24 * fps, 0.5 * fps], [1, 0.35, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const float = Math.sin(progress * Math.PI * 2) * -18;
  const rotate = interpolate(progress, [0, 1], [-0.8, 0.9]);
  const cardScale = interpolate(reveal, [0, 1], [0.94, 1]);
  const reelAssets = assets.slice(0, 8);
  const callout = calloutForScene(sceneTitle);

  return (
    <div
      style={{
        position: "absolute",
        right: 78,
        top: 58,
        width: 1040,
        height: 1280,
      }}
    >
      {assets.length > 1 ? (
        <CardReel
          assets={reelAssets}
          activeIndex={activeIndex}
          accent={accent}
          frame={frame}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          right: featuredIsWide ? 0 : 70,
          top: featuredIsWide ? 160 : 0,
          width: featuredIsWide ? 980 : 780,
          height: featuredIsWide ? 590 : 1135,
          border: `4px solid ${accent}`,
          backgroundColor: "rgba(0,0,0,0.34)",
          boxShadow: "0 54px 120px rgba(0,0,0,0.74)",
          overflow: "hidden",
          padding: featuredIsWide ? 0 : 0,
          transform: `translateY(${float + (1 - reveal) * 42}px) rotate(${rotate}deg) scale(${cardScale})`,
          opacity: reveal,
        }}
      >
        <Img
          src={staticFile(featured.path)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: featuredIsWide ? "cover" : "contain",
            filter: "saturate(1.06) contrast(1.04)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(108deg, transparent 0%, transparent ${Math.max(
              0,
              42 - swipe * 42,
            )}%, ${accent}55 ${Math.max(0, 49 - swipe * 42)}%, transparent ${Math.max(
              0,
              58 - swipe * 42,
            )}%, transparent 100%)`,
            opacity: swipe,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          right: featuredIsWide ? 0 : 70,
          top: featuredIsWide ? 104 : 34,
          padding: "13px 18px",
          backgroundColor: accent,
          color: "#050505",
          fontSize: 32,
          lineHeight: 1,
          fontWeight: 930,
          textTransform: "uppercase",
          boxShadow: "0 18px 44px rgba(0,0,0,0.46)",
          transform: `translateY(${(1 - reveal) * -18}px)`,
          opacity: reveal,
        }}
      >
        {callout}
      </div>
      <div
        style={{
          position: "absolute",
          right: featuredIsWide ? 0 : 70,
          top: featuredIsWide ? 772 : 1156,
          maxWidth: featuredIsWide ? 980 : 780,
          padding: "18px 24px",
          backgroundColor: "rgba(0,0,0,0.70)",
          borderLeft: `6px solid ${accent}`,
          color: "#fff7df",
          fontSize: 38,
          lineHeight: 1.04,
          fontWeight: 860,
          textAlign: "right",
          boxShadow: "0 24px 58px rgba(0,0,0,0.42)",
        }}
      >
        {featured.title}
      </div>
      {assets.length > 1 ? (
        <div
          style={{
            position: "absolute",
            left: 218,
            bottom: 36,
            width: 690,
            height: 5,
            backgroundColor: "rgba(255,255,255,0.14)",
          }}
        >
          <div
            style={{
              width: `${Math.round(((activeIndex + cycleFrame / cardCycleFrames) / assets.length) * 10000) / 100}%`,
              height: "100%",
              backgroundColor: accent,
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

const getCardCycleFrames = (
  assetCount: number,
  durationInFrames: number,
  fps: number,
): number => {
  if (assetCount <= 0) {
    return durationInFrames;
  }

  return Math.max(
    Math.round(1.7 * fps),
    Math.min(Math.floor(durationInFrames / assetCount), Math.round(3.1 * fps)),
  );
};

const getActiveVisualIndex = (
  assetCount: number,
  frame: number,
  durationInFrames: number,
  fps: number,
): number => {
  if (assetCount <= 0) {
    return 0;
  }

  const cycleFrames = getCardCycleFrames(assetCount, durationInFrames, fps);
  return Math.floor(frame / cycleFrames) % assetCount;
};

const calloutForScene = (sceneTitle: string): string => {
  const title = sceneTitle.toLowerCase();
  if (title.includes("ядро") || title.includes("лучшие легендар")) {
    return "ядро меты";
  }
  if (title.includes("конкретную") || title.includes("архетип")) {
    return "под колоду";
  }
  if (title.includes("потенциал")) {
    return "точечный крафт";
  }
  if (title.includes("подождать") || title.includes("пауза")) {
    return "не спешить";
  }
  if (title.includes("эпик")) {
    return "выгодный слот";
  }
  if (title.includes("ситуатив")) {
    return "по ситуации";
  }
  return "крафт чек";
};

const CardReel: React.FC<{
  assets: PipelineAsset[];
  activeIndex: number;
  accent: string;
  frame: number;
}> = ({ assets, activeIndex, accent, frame }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 82,
        width: 156,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {assets.map((asset, index) => {
        const isActive = index === activeIndex;
        const pulse = isActive ? 1 + Math.sin(frame / 8) * 0.015 : 1;
        const entrance = interpolate(
          frame,
          [index * 3, index * 3 + 12],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
        );

        return (
          <div
            key={asset.id}
            style={{
              position: "relative",
              width: isActive ? 148 : 126,
              height: isActive ? 204 : 174,
              border: `3px solid ${isActive ? accent : "rgba(255,255,255,0.18)"}`,
              backgroundColor: "rgba(0,0,0,0.56)",
              boxShadow: isActive
                ? `0 18px 46px rgba(0,0,0,0.52), 0 0 32px ${accent}55`
                : "0 14px 32px rgba(0,0,0,0.42)",
              overflow: "hidden",
              opacity: interpolate(entrance, [0, 1], [0, isActive ? 1 : 0.74]),
              transform: `translateX(${(1 - entrance) * -36}px) scale(${pulse}) rotate(${
                isActive ? -1.2 : index % 2 === 0 ? 1.8 : -1.8
              }deg)`,
            }}
          >
            <Img
              src={staticFile(asset.path)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: isActive
                  ? "saturate(1.08) contrast(1.04)"
                  : "saturate(0.8) contrast(0.9) brightness(0.74)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

const ProgressBar: React.FC<{ progress: number; accent: string }> = ({
  progress,
  accent,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: "100%",
        height: 6,
        backgroundColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          width: `${Math.round(progress * 10000) / 100}%`,
          height: "100%",
          backgroundColor: accent,
        }}
      />
    </div>
  );
};
