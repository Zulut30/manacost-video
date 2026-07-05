import "./index.css";
import { Composition } from "remotion";
import {
  ArticleVideo,
  calculateArticleVideoMetadata,
} from "./video/ArticleVideo";
import { sampleManifest } from "./video/sampleManifest";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ArticleVideo"
        component={ArticleVideo}
        durationInFrames={300}
        fps={30}
        width={2560}
        height={1440}
        defaultProps={{ manifest: sampleManifest }}
        calculateMetadata={calculateArticleVideoMetadata}
      />
    </>
  );
};
