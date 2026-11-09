/*
 * Nadabuje repliky FSD autopilota přes ElevenLabs → public/fsd/{lang}/{key}.mp3.
 * Texty bere z src/app/i18n.ts (klíče fsd.say.*); znovu generuje jen to, co se změnilo
 * (public/fsd/manifest.json drží text, ze kterého mp3 vzniklo).
 *
 *   ELEVENLABS_API_KEY=sk_... node scripts/build-fsd-voice.mjs [--force] [--dry]
 *
 * Bez klíče, ve WorkMux session, jde dabing přes media API session (účet ElevenLabs
 * vlastníka projektu) — musí v projektu mít povolené Audio.
 */
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/fsd");
// hlas Ivan Trojan
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "HnUIzNyA2d2XenwmD6dv";
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
const KEY = process.env.ELEVENLABS_API_KEY;
const WORKMUX = process.env.WORKMUX_API_BASE && process.env.WORKMUX_SESSION_ID
    ? `${process.env.WORKMUX_API_BASE}/api/sessions/${process.env.WORKMUX_SESSION_ID}/media`
    : null;
const force = process.argv.includes("--force");
const dry = process.argv.includes("--dry");

if (!KEY && !WORKMUX && !dry) {
    console.error("Chybí ELEVENLABS_API_KEY (nebo WorkMux session)");
    process.exit(1);
}

async function elevenlabs(text, lang) {
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
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wm = (path, init = {}) => fetch(`${WORKMUX}${path}`, {
    ...init,
    headers: {"x-workmux-token": process.env.WORKMUX_API_TOKEN ?? "", "Content-Type": "application/json", ...init.headers},
});

async function workmux(text, lang) {
    const res = await wm("/audio", {
        method: "POST",
        body: JSON.stringify({operation: "speech", text, voice: VOICE, model: "multilingual", language: lang}),
        signal: AbortSignal.timeout(210_000),
    });
    let data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
    // projekt může chtít schválení každého generování — počkej, až ho vlastník potvrdí
    if (data.status === "pending_approval") {
        console.log(`  čeká na schválení ve WorkMuxu (${data.request_id}, $${data.price_usd})`);
        for (;;) {
            await sleep(5000);
            const r = await (await wm(`/requests/${data.request_id}`)).json();
            if (r.status === "done" && r.attachment) {
                data = r.attachment;
                break;
            }
            if (["failed", "rejected", "expired"].includes(r.status)) throw new Error(`${r.status} ${r.error ?? r.reason ?? ""}`);
        }
    }
    const file = await wm(`/attachments/${encodeURIComponent(data.id)}`);
    if (!file.ok) throw new Error(`stažení ${data.id}: ${file.status}`);
    return Buffer.from(await file.arrayBuffer());
}

const src = await readFile(join(ROOT, "src/app/i18n.ts"), "utf8");
const [cs, en] = src.split(/\n    en: \{/);
const lines = (part) => [...part.matchAll(/"fsd\.say\.([\w-]+)": "((?:[^"\\]|\\.)*)"/g)]
    .map(([, key, text]) => ({key, text: JSON.parse(`"${text}"`)}));

const manifestPath = join(OUT, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}"));

let todo = 0;
for (const [lang, part] of [["cs", cs], ["en", en]]) {
    await mkdir(join(OUT, lang), {recursive: true});
    for (const {key, text} of lines(part)) {
        const id = `${lang}/${key}`;
        if (!force && manifest[id] === text) continue;
        todo++;
        if (dry) {
            console.log("·", id);
            continue;
        }
        const mp3 = KEY ? await elevenlabs(text, lang) : await workmux(text, lang);
        await writeFile(join(OUT, `${id}.mp3`), mp3);
        manifest[id] = text;
        // manifest průběžně, ať přerušený běh nezačíná znovu
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
        console.log("✓", id);
    }
}
console.log(dry ? `${todo} replik k nadabování` : `hotovo (${todo})`);
