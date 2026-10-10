/*
 * Nadabuje repliky FSD autopilota přes ElevenLabs → public/fsd/{lang}/{key}.mp3.
 * Texty bere z src/app/i18n.ts (klíče fsd.say.*); znovu generuje jen to, co se změnilo
 * (public/fsd/manifest.json drží text, ze kterého mp3 vzniklo).
 *
 *   ELEVENLABS_API_KEY=sk_... node scripts/build-fsd-voice.mjs [--force]
 */
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/fsd");
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "HnUIzNyA2d2XenwmD6dv";
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
const KEY = process.env.ELEVENLABS_API_KEY;
const force = process.argv.includes("--force");

if (!KEY) {
    console.error("Chybí ELEVENLABS_API_KEY");
    process.exit(1);
}

const src = await readFile(join(ROOT, "src/app/i18n.ts"), "utf8");
const [cs, en] = src.split(/\n    en: \{/);
const lines = (part) => [...part.matchAll(/"fsd\.say\.([\w-]+)": "((?:[^"\\]|\\.)*)"/g)]
    .map(([, key, text]) => ({key, text: JSON.parse(`"${text}"`)}));

const manifestPath = join(OUT, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}"));

for (const [lang, part] of [["cs", cs], ["en", en]]) {
    await mkdir(join(OUT, lang), {recursive: true});
    for (const {key, text} of lines(part)) {
        const id = `${lang}/${key}`;
        if (!force && manifest[id] === text) continue;
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
            method: "POST",
            headers: {"xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg"},
            body: JSON.stringify({
                text,
                model_id: MODEL,
                language_code: lang,
                voice_settings: {stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true},
            }),
        });
        if (!res.ok) throw new Error(`${id}: ${res.status} ${await res.text()}`);
        await writeFile(join(OUT, `${id}.mp3`), Buffer.from(await res.arrayBuffer()));
        manifest[id] = text;
        console.log("✓", id);
    }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
