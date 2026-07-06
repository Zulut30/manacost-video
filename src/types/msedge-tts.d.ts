declare module "msedge-tts" {
  export const OUTPUT_FORMAT: {
    WEBM_24KHZ_16BIT_MONO_OPUS: string;
  };

  export class MsEdgeTTS {
    setMetadata(
      voiceName: string,
      outputFormat: string,
      options?: {
        wordBoundaryEnabled?: boolean;
        sentenceBoundaryEnabled?: boolean;
      },
    ): Promise<void>;

    toFile(
      outputDirectory: string,
      input: string,
      options?: {
        rate?: number | string;
        pitch?: string;
        volume?: string;
      },
    ): Promise<{ audioFilePath: string; metadataFilePath?: string }>;
  }
}
