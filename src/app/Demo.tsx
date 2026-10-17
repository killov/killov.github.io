"use client"

import React, {useCallback, useEffect, useRef, useState} from "react"
import style from "./style.module.scss";
import {useLanguage} from "./LanguageContext";
import {hush, say} from "./Fsd";
import type {DemoBox, DemoCue, DemoItem} from "./data/profile";
import type {Lang} from "./i18n";

/*
 * Reálné ukázky projektů — záznamy a screenshoty pořízené na produkci.
 * DemoFeed = malý „monitor“ v kartě hologramu, DemoViewer = celoobrazovkové
 * kino, které záběry okomentuje: titulek + hlas (dabing FSD, jinak hlas
 * prohlížeče) a kamera se přiblíží k tomu, o čem je řeč. Video na komentář
 * počká, záběry jdou samy po sobě — FSD tak ukázky projede bez zásahu.
 */

const base = (item: DemoItem, lang: Lang) => (item.localized ? `${item.src}-${lang}` : item.src);

/** náhledový obrázek: u videa plakát, u obrázku on sám */
export const demoThumb = (item: DemoItem, lang: Lang) => `${base(item, lang)}.webp`;

const pad2 = (n: number) => String(n).padStart(2, "0");
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const readingTime = (text: string) => clamp(text.length * 55, 2600, 8000);

/** kamera nad záběrem: přiblížení tak, aby výřez vyplnil rám, ale nevyjel z obrazu */
function camera(box?: DemoBox) {
    if (!box) return {s: 1, x: 0, y: 0};
    const [bx, by, bw, bh] = box;
    const s = clamp(Math.min(100 / bw, 100 / bh) * 0.9, 1, 2);
    const half = 50 / s;
    const cx = clamp(bx + bw / 2, half, 100 - half);
    const cy = clamp(by + bh / 2, half, 100 - half);
    return {s, x: 50 - cx, y: 50 - cy};
}

const VOICE_KEY = "demo-voice";

/** video přes <source>, ať si Safari vezme mp4 a ostatní menší webm */
const DemoVideo = React.forwardRef<HTMLVideoElement, {item: DemoItem; lang: Lang; loop?: boolean; className?: string}>(
    ({item, lang, loop, className}, ref) => (
        <video
            ref={ref}
            key={item.src}
            className={className}
            poster={demoThumb(item, lang)}
            autoPlay={loop}
            muted
            loop={loop}
            playsInline
            preload="auto"
        >
            <source src={`${base(item, lang)}.webm`} type="video/webm"/>
            <source src={`${base(item, lang)}.mp4`} type="video/mp4"/>
        </video>
    ),
);
DemoVideo.displayName = "DemoVideo";

/** malý monitor do karty projektu: první záběr naživo + náhledy ostatních */
export const DemoFeed: React.FC<{demos: DemoItem[]; title: string; paused?: boolean; onOpen: (index: number) => void}> = ({demos, title, paused, onOpen}) => {
    const {t, lang} = useLanguage();
    // na nízkém / úzkém displeji se monitor nevejde vedle hologramu — jen náhledy
    const [big, setBig] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(min-width: 801px) and (min-height: 760px)");
        const sync = () => setBig(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);
    const first = demos[0];
    return (
        <div className={style.demoFeed}>
            <div className={style.demoFeedHead}>
                <span className={style.demoRec} aria-hidden="true"/>
                {t("demo.title")}
                <span className={style.demoFeedCount}>{pad2(demos.length)}</span>
            </div>
            {big && (
                <button type="button" className={style.demoMonitor} onClick={() => onOpen(0)} aria-label={`${t("demo.play")} — ${title}`}>
                    {first.type === "video" && !paused
                        ? <DemoVideo item={first} lang={lang} loop/>
                        : <img src={demoThumb(first, lang)} alt=""/>}
                    <span className={style.demoMonitorLabel}>▶ {t("demo.play")}</span>
                </button>
            )}
            <ul className={style.demoThumbs}>
                {demos.map((d, i) => (big && i === 0 ? null : (
                    <li key={d.src}>
                        <button type="button" className={style.demoThumb} onClick={() => onOpen(i)} aria-label={t(d.captionKey)}>
                            <img src={demoThumb(d, lang)} alt="" loading="lazy"/>
                            {d.type === "video" && <span className={style.demoThumbPlay} aria-hidden="true">▶</span>}
                        </button>
                    </li>
                )))}
            </ul>
        </div>
    );
};

/** celoobrazovkové kino: okomentovaná prohlídka všech záběrů projektu */
export const DemoViewer: React.FC<{
    demos: DemoItem[];
    title: string;
    href?: string;
    start: number;
    /** provází FSD: záběry s fsd: false přeskočí a po posledním zavolá onDone */
    guided: boolean;
    /** výchozí stav komentáře nahlas (u FSD podle jeho hlasu) */
    voice?: boolean;
    onDone: () => void;
    onClose: () => void;
}> = ({demos, title, href, start, guided, voice: voiceInit, onDone, onClose}) => {
    const {t, lang} = useLanguage();
    const [items] = useState(() => (guided ? demos.filter((d) => d.fsd !== false) : demos));
    const [index, setIndex] = useState(() => clamp(start, 0, items.length - 1));
    const [cue, setCue] = useState(-1);
    const [paused, setPaused] = useState(false);
    const [finished, setFinished] = useState(false);
    const [voice, setVoice] = useState(() => voiceInit ?? (typeof localStorage === "undefined" || localStorage.getItem(VOICE_KEY) !== "0"));
    const [round, setRound] = useState(0);
    const closeRef = useRef<HTMLButtonElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const pausedRef = useRef(false);
    pausedRef.current = paused;
    const voiceRef = useRef(voice);
    voiceRef.current = voice;
    const tRef = useRef(t);
    tRef.current = t;
    const guidedRef = useRef(guided);
    guidedRef.current = guided;
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;
    const item = items[index];
    const current: DemoCue | undefined = cue >= 0 ? item.cues[cue] : undefined;
    const cam = camera(current?.box);

    const go = useCallback((i: number) => {
        setFinished(false);
        setPaused(false);
        setCue(-1);
        setIndex((i + items.length) % items.length);
        setRound((r) => r + 1);
    }, [items.length]);

    /** konec záběru: další, nebo konec prohlídky */
    const advance = useCallback(() => {
        if (index < items.length - 1) go(index + 1);
        else if (guidedRef.current) onDoneRef.current();
        else setFinished(true);
    }, [index, items.length, go]);

    /** řekne komentář; bez hlasu aspoň nechá čas na přečtení (u obrázků) */
    const speakCue = useCallback((c: DemoCue, hold: boolean) => {
        const line = tRef.current(c.say);
        return Promise.all([
            voiceRef.current ? say(c.say, line, lang) : Promise.resolve(),
            hold ? sleep(readingTime(line)) : Promise.resolve(),
        ]).then(() => undefined);
    }, [lang]);

    // režie jednoho záběru: komentáře v čase, kamera, přechod na další
    useEffect(() => {
        let alive = true;
        const waitPlay = async () => {
            while (alive && pausedRef.current) await sleep(150);
        };

        if (item.type === "image") {
            void (async () => {
                await sleep(500);
                for (let i = 0; alive && i < item.cues.length; i++) {
                    await waitPlay();
                    if (!alive) return;
                    setCue(i);
                    await speakCue(item.cues[i], true);
                    await sleep(500);
                }
                await waitPlay();
                if (alive) advance();
            })();
            return () => {
                alive = false;
                hush();
            };
        }

        const video = videoRef.current;
        if (!video) return;
        let next = 0;
        let speaking = false;
        let holding = false;
        let ended = false;
        let leaving = false;
        let frame = 0;
        const onEnded = () => {
            ended = true;
        };
        video.addEventListener("ended", onEnded);
        video.currentTime = 0;
        void video.play().catch(() => undefined);
        const tick = () => {
            if (!alive) return;
            frame = requestAnimationFrame(tick);
            if (pausedRef.current) return;
            const c = item.cues[next];
            if (c && video.currentTime >= (c.at ?? 0)) {
                if (speaking) {
                    // komentář ještě běží — obraz na něj počká
                    if (!video.paused) video.pause();
                    holding = true;
                    return;
                }
                const n = next++;
                setCue(n);
                speaking = true;
                void speakCue(c, false).then(() => {
                    speaking = false;
                });
                if (holding) {
                    holding = false;
                    void video.play().catch(() => undefined);
                }
            } else if (holding && !speaking) {
                holding = false;
                void video.play().catch(() => undefined);
            }
            if (ended && !speaking && !leaving) {
                leaving = true;
                void sleep(900).then(() => alive && advance());
            }
        };
        frame = requestAnimationFrame(tick);
        return () => {
            alive = false;
            cancelAnimationFrame(frame);
            video.removeEventListener("ended", onEnded);
            hush();
        };
    }, [item, round, speakCue, advance]);

    // pauza / pokračování
    useEffect(() => {
        const video = videoRef.current;
        if (paused) {
            video?.pause();
            hush();
        } else if (video && video.paused && !video.ended && item.type === "video") {
            void video.play().catch(() => undefined);
        }
    }, [paused, item]);

    const toggleVoice = useCallback(() => {
        setVoice((v) => {
            if (v) hush();
            try {
                localStorage.setItem(VOICE_KEY, v ? "0" : "1");
            } catch {
                // soukromý režim — nevadí
            }
            return !v;
        });
    }, []);

    const togglePlay = useCallback(() => {
        if (finished) go(0);
        else setPaused((p) => !p);
    }, [finished, go]);

    useEffect(() => {
        closeRef.current?.focus({preventScroll: true});
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowRight") go(index + 1);
            else if (e.key === "ArrowLeft") go(index - 1);
            else if (e.key === " " && !(e.target as HTMLElement).closest("button")) togglePlay();
            else return;
            e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, go, index, togglePlay]);

    useEffect(() => () => hush(), []);

    return (
        <div className={style.demoViewer} role="dialog" aria-modal="true" aria-label={`${title} — ${t("demo.title")}`} onClick={onClose}>
            <div
                className={style.demoViewerInner}
                style={{"--ar": String(item.aspect)} as React.CSSProperties}
                onClick={(e) => e.stopPropagation()}
            >
                <header className={style.demoViewerHead}>
                    <span className={style.demoRec} aria-hidden="true"/>
                    <span className={style.demoViewerKicker}>{t("demo.live")}</span>
                    <h3 className={style.demoViewerTitle}>{title}</h3>
                    {guided && <span className={style.demoGuided}>{t("demo.guided")}</span>}
                    <span className={style.demoViewerCount}>{pad2(index + 1)}/{pad2(items.length)}</span>
                    <button ref={closeRef} type="button" className={style.demoClose} onClick={onClose} aria-label={t("showcase.close")}>✕</button>
                </header>

                <figure className={style.demoStage}>
                    <div className={style.demoScreen} key={`${item.src}-${lang}-${round}`} onClick={togglePlay}>
                        <div
                            className={style.demoLayer}
                            style={{
                                transform: `scale(${cam.s}) translate(${cam.x}%, ${cam.y}%)`,
                                "--s": String(cam.s),
                            } as React.CSSProperties}
                        >
                            {item.type === "video"
                                ? <DemoVideo ref={videoRef} item={item} lang={lang} className={style.demoMedia}/>
                                : <img className={style.demoMedia} src={demoThumb(item, lang)} alt={t(item.captionKey)}/>}
                            {current?.box && (
                                <span
                                    key={cue}
                                    className={style.demoFocus}
                                    style={{
                                        left: `${current.box[0]}%`,
                                        top: `${current.box[1]}%`,
                                        width: `${current.box[2]}%`,
                                        height: `${current.box[3]}%`,
                                    }}
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                        {current && (
                            <p className={style.demoSub} key={`${index}-${cue}`} aria-live="polite">
                                {t(current.say)}
                            </p>
                        )}
                        {(paused || finished) && (
                            <span className={style.demoPaused} aria-hidden="true">{finished ? "↻" : "▶"}</span>
                        )}
                        <ol className={style.demoCues} aria-hidden="true">
                            {item.cues.map((_, i) => (
                                <li key={i} className={i < cue ? style.demoCueDone : i === cue ? style.demoCueNow : undefined}/>
                            ))}
                        </ol>
                        {items.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    className={`${style.demoArrow} ${style.demoArrowPrev}`}
                                    onClick={(e) => { e.stopPropagation(); go(index - 1); }}
                                    aria-label={t("demo.prev")}
                                >‹</button>
                                <button
                                    type="button"
                                    className={`${style.demoArrow} ${style.demoArrowNext}`}
                                    onClick={(e) => { e.stopPropagation(); go(index + 1); }}
                                    aria-label={t("demo.next")}
                                >›</button>
                            </>
                        )}
                    </div>
                    <figcaption className={style.demoCaption}>{t(item.captionKey)}</figcaption>
                </figure>

                <footer className={style.demoViewerFoot}>
                    <div className={style.demoControls}>
                        <button
                            type="button"
                            className={style.demoCtl}
                            onClick={togglePlay}
                            aria-label={finished ? t("demo.replay") : paused ? t("demo.play1") : t("demo.pause")}
                        >
                            {finished ? "↻" : paused ? "▶" : "❚❚"}
                        </button>
                        <button
                            type="button"
                            className={`${style.demoCtl} ${voice ? style.demoCtlOn : ""}`}
                            onClick={toggleVoice}
                            aria-pressed={voice}
                            title={t("demo.voice")}
                        >
                            {voice ? "🔊" : "🔇"}
                        </button>
                        <ul className={style.demoThumbs}>
                            {items.map((d, i) => (
                                <li key={d.src}>
                                    <button
                                        type="button"
                                        className={`${style.demoThumb} ${i === index ? style.demoThumbActive : ""}`}
                                        onClick={() => go(i)}
                                        aria-label={t(d.captionKey)}
                                        aria-current={i === index}
                                    >
                                        <img src={demoThumb(d, lang)} alt="" loading="lazy"/>
                                        {d.type === "video" && <span className={style.demoThumbPlay} aria-hidden="true">▶</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className={style.demoViewerActions}>
                        <span className={style.demoHint}>{t("demo.hint")}</span>
                        {href && (
                            <a className={style.btnPrimary} href={href} target="_blank" rel="noreferrer">{t("projects.visit")} →</a>
                        )}
                    </div>
                </footer>
            </div>
        </div>
    );
};
