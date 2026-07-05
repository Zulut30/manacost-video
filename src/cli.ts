import "dotenv/config";
import { Command } from "commander";
import { collectAssets } from "./pipeline/assets";
import { ensureGeneratedMusic } from "./pipeline/audio";
import { fetchArticle } from "./pipeline/article";
import { DEFAULT_TARGET_MINUTES } from "./pipeline/constants";
import { loadManifest, saveManifestArtifacts } from "./pipeline/manifest";
import { qaVideo } from "./pipeline/qa";
import { renderManifest } from "./pipeline/render";
import { buildInitialManifest } from "./pipeline/script";
import { generateVoiceover } from "./pipeline/voiceover";

const program = new Command();

program
  .name("manacost-video")
  .description("Generate 2K YouTube videos from Manacost Hearthstone articles")
  .version("0.1.0");

program
  .command("from-url")
  .argument("<url>", "Article URL")
  .option("--target-minutes <minutes>", "Target video length", String(DEFAULT_TARGET_MINUTES))
  .option("--skip-voiceover", "Skip ElevenLabs generation")
  .option("--force-assets", "Redownload article and HSData images")
  .option("--force-voiceover", "Regenerate existing ElevenLabs MP3 files")
  .option("--force-music", "Regenerate generated music bed")
  .option("--no-render", "Create manifest/assets/audio but do not render MP4")
  .action(async (url: string, options: Record<string, unknown>) => {
    const targetMinutes = Number(options.targetMinutes || DEFAULT_TARGET_MINUTES);
    let manifest = buildInitialManifest(await fetchArticle(url), { targetMinutes });

    manifest = await collectAssets(manifest, {
      force: Boolean(options.forceAssets),
    });

    if (!options.skipVoiceover) {
      manifest = await generateVoiceover(manifest, {
        force: Boolean(options.forceVoiceover),
      });
    }

    manifest = ensureGeneratedMusic(manifest, Boolean(options.forceMusic));
    saveManifestArtifacts(manifest);

    if (options.render !== false) {
      manifest = await renderManifest(manifest);
      manifest = qaVideo(manifest);
      saveManifestArtifacts(manifest);
    }

    console.log(`Manifest: output/${manifest.slug}/manifest.json`);
    if (manifest.render?.outputPath) {
      console.log(`Video: ${manifest.render.outputPath}`);
    }
    for (const warning of manifest.render?.warnings || []) {
      console.warn(`Warning: ${warning}`);
    }
  });

program
  .command("voiceover")
  .argument("<slug-or-manifest>", "Article slug or path to manifest.json")
  .option("--force", "Regenerate existing MP3 files")
  .action(async (slugOrManifest: string, options: { force?: boolean }) => {
    let manifest = loadManifest(slugOrManifest);
    manifest = await generateVoiceover(manifest, { force: options.force });
    manifest = ensureGeneratedMusic(manifest);
    saveManifestArtifacts(manifest);
    console.log(`Voiceover: output/${manifest.slug}/manifest.json`);
  });

program
  .command("render")
  .argument("<slug-or-manifest>", "Article slug or path to manifest.json")
  .action(async (slugOrManifest: string) => {
    let manifest = loadManifest(slugOrManifest);
    manifest = await renderManifest(manifest);
    manifest = qaVideo(manifest);
    saveManifestArtifacts(manifest);
    console.log(`Video: ${manifest.render?.outputPath}`);
  });

program
  .command("qa")
  .argument("<slug-or-manifest>", "Article slug or path to manifest.json")
  .action((slugOrManifest: string) => {
    const manifest = qaVideo(loadManifest(slugOrManifest));
    saveManifestArtifacts(manifest);
    console.log(JSON.stringify(manifest.render, null, 2));
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
