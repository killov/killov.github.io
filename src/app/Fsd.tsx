import React, {useCallback, useEffect, useRef, useState} from "react";
import style from "./style.module.scss";
import {Lang} from "./i18n";
import {projects} from "./data/profile";
import {STATIONS} from "./scene/stations";
import type {GameCommand} from "./scene/Universe";

/*
 * FSD — autopilot jako v Tesle: po zapnutí kamera sama proletí všechny
 * zastávky, u každé řekne pár vět (titulek + hlas, pokud ho prohlížeč umí)
 * a u projektů otevře hologramy. Jakýkoliv zásah (scroll, klávesa, klik,
 * dotyk) = převzetí řízení, autopilot se vypne.
 */

type FsdShowcase = {kind: "project"; index: number};

interface FsdStep {
    station: number;
    /** klíč do i18n — co autopilot řekne */
    say: string;
    open?: FsdShowcase;
    /** krok ve hře: autopilot ji sám zapne a předvede raketu / hod Zemí */
    game?: "rocket" | "throw";
    /** místo z CV: autopilot „klikne“ na kartičku a otevře ho ve 3D městě */
    place?: string;
}

const station = (id: string) => STATIONS.findIndex((s) => s.id === id);
const project = (title: string): FsdShowcase => ({kind: "project", index: projects.findIndex((p) => p.title === title)});

const ROUTE: FsdStep[] = [
    {station: station("hero"), say: "fsd.say.hero"},
    {station: station("about"), say: "fsd.say.about"},
    {station: station("stack"), say: "fsd.say.stack"},
    {station: station("projects"), say: "fsd.say.projects"},
    {station: station("projects"), say: "fsd.say.worldee", open: project("Worldee")},
    {station: station("projects"), say: "fsd.say.workmux", open: project("WorkMux")},
    {station: station("projects"), say: "fsd.say.drive", open: project("Drive")},
    {station: station("experience"), say: "fsd.say.experience"},
    {station: station("education"), say: "fsd.say.education", place: "up"},
    {station: station("education"), say: "fsd.say.game", game: "rocket"},
    {station: station("education"), say: "fsd.say.throw", game: "throw"},
    {station: station("contact"), say: "fsd.say.contact"},
];

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeout: number, alive: () => boolean) {
    const until = performance.now() + timeout;
    while (alive() && !cond() && performance.now() < until) await sleep(100);
}

function voiceFor(lang: Lang): SpeechSynthesisVoice | undefined {
    if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
    return voices.find((v) => v.localService) ?? voices[0];
}

/** právě hrající dabing (public/fsd/{lang}/{key}.mp3 ze scripts/build-fsd-voice.mjs) */
let dub: HTMLAudioElement | null = null;

function hush() {
    dub?.pause();
    dub = null;
    window.speechSynthesis?.cancel();
}

/** přehraje nadabovanou repliku; když mp3 nejde, přečte text hlasem prohlížeče */
function say(key: string, text: string, lang: Lang): Promise<void> {
    hush();
    const audio = new Audio(`/fsd/${lang}/${key.replace("fsd.say.", "")}.mp3`);
    dub = audio;
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        audio.onended = finish;
        audio.onpause = finish;
        audio.onerror = () => {
            if (dub !== audio) return finish();
            dub = null;
            void speak(text, lang).then(finish);
        };
        audio.play().catch(() => audio.onerror?.(new Event("error")));
        // pojistka, kdyby onended nepřišlo
        window.setTimeout(finish, 30000);
    });
}

/** přečte text nahlas; resolve po dočtení (nebo hned, když hlas není) */
function speak(text: string, lang: Lang): Promise<void> {
    const voice = voiceFor(lang);
    if (!voice) return Promise.resolve();
    return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 1.05;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
        // pojistka — některé prohlížeče onend občas nepošlou
        window.setTimeout(resolve, 4000 + text.length * 110);
    });
}

const readingTime = (text: string) => Math.min(Math.max(text.length * 55, 3800), 9000);

interface FsdOptions {
    goTo: (station: number) => void;
    openShowcase: (key: FsdShowcase) => void;
    closeShowcase: () => void;
    enterGame: () => void;
    exitGame: () => void;
    openPlace: (id: string) => void;
    exitPlace: () => void;
    gameCommand: (cmd: GameCommand) => void;
    activeRef: React.MutableRefObject<number>;
    t: (key: string) => string;
    lang: Lang;
    /** hra / 3D město — když je zapne uživatel, autopilot se vypne */
    blocked: boolean;
}

export interface FsdState {
    on: boolean;
    step: number;
    text: string;
    voice: boolean;
    message: string | null;
    toggle: () => void;
    toggleVoice: () => void;
    stop: () => void;
}

export function useFsd({goTo, openShowcase, closeShowcase, enterGame, exitGame, openPlace, exitPlace, gameCommand, activeRef, t, lang, blocked}: FsdOptions): FsdState {
    const [on, setOn] = useState(false);
    const [step, setStep] = useState(0);
    const [text, setText] = useState("");
    const [voice, setVoice] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const runRef = useRef(0);
    const onRef = useRef(false);
    const voiceRef = useRef(voice);
    voiceRef.current = voice;
    const tRef = useRef(t);
    tRef.current = t;
    const langRef = useRef(lang);
    langRef.current = lang;
    const messageTimer = useRef(0);
    /** hru zapnul autopilot (ne uživatel) — pak ho nevypíná */
    const gameRef = useRef(false);
    /** 3D město otevřel autopilot */
    const placeRef = useRef(false);

    const flash = useCallback((key: string) => {
        setMessage(tRef.current(key));
        window.clearTimeout(messageTimer.current);
        messageTimer.current = window.setTimeout(() => setMessage(null), 2800);
    }, []);

    const disengage = useCallback((key: string) => {
        if (!onRef.current) return;
        runRef.current++;
        onRef.current = false;
        gameRef.current = false;
        placeRef.current = false;
        setOn(false);
        hush();
        flash(key);
    }, [flash]);

    /** ukáže proklik: kartička místa se rozbliká jako pod kurzorem, pak se otevře 3D město */
    const showPlace = useCallback(async (id: string, alive: () => boolean) => {
        const card = document.querySelector<HTMLElement>(`[data-place="${id}"]`);
        card?.classList.add(style.fsdClick);
        await sleep(1600);
        card?.classList.remove(style.fsdClick);
        if (!alive()) return;
        placeRef.current = true;
        openPlace(id);
    }, [openPlace]);

    const engage = useCallback(async () => {
        const id = ++runRef.current;
        const alive = () => runRef.current === id;
        onRef.current = true;
        setOn(true);
        setMessage(null);
        // Chrome načítá hlasy líně — první getVoices() bývá prázdné
        window.speechSynthesis?.getVoices();

        for (let i = 0; i < ROUTE.length; i++) {
            const s = ROUTE[i];
            setStep(i);
            setText("");
            closeShowcase();
            if (!s.place && placeRef.current) {
                placeRef.current = false;
                exitPlace();
                await sleep(1400);
            }
            if (s.game && !gameRef.current) {
                gameRef.current = true;
                enterGame();
                await sleep(1800);
            } else if (!s.game && gameRef.current) {
                gameRef.current = false;
                exitGame();
                await sleep(1400);
            }
            if (!alive()) return;
            if (s.game) {
                gameCommand(s.game === "rocket" ? {type: "rocket"} : {type: "demoThrow"});
            } else if (activeRef.current !== s.station) {
                goTo(s.station);
                await waitFor(() => activeRef.current === s.station, 6000, alive);
                await sleep(900);
            } else {
                await sleep(i === 0 ? 300 : 500);
            }
            if (!alive()) return;
            if (s.open && s.open.index >= 0) {
                openShowcase(s.open);
                await sleep(700);
                if (!alive()) return;
            }
            const line = tRef.current(s.say);
            setText(line);
            await Promise.all([
                voiceRef.current ? say(s.say, line, langRef.current) : Promise.resolve(),
                sleep(readingTime(line)),
                s.place ? showPlace(s.place, alive) : Promise.resolve(),
            ]);
            if (!alive()) return;
            // po hodu chvíli počkej, ať je vidět zásah Slunce
            await sleep(s.game === "throw" || s.place ? 2500 : 400);
            if (!alive()) return;
        }
        closeShowcase();
        disengage("fsd.arrived");
    }, [goTo, openShowcase, closeShowcase, enterGame, exitGame, gameCommand, activeRef, disengage, showPlace]);

    const toggle = useCallback(() => {
        if (onRef.current) disengage("fsd.off");
        else if (!blocked) void engage();
    }, [blocked, engage, disengage]);

    const toggleVoice = useCallback(() => {
        setVoice((v) => {
            if (v) hush();
            return !v;
        });
    }, []);

    const stop = useCallback(() => disengage("fsd.off"), [disengage]);

    // klávesa F zapíná/vypíná; jakýkoliv jiný zásah = převzetí řízení
    useEffect(() => {
        const fromFsd = (e: Event) => (e.target as HTMLElement | null)?.closest?.("[data-fsd]");
        const takeover = (e: Event) => {
            if (onRef.current && !fromFsd(e)) disengage("fsd.takeover");
        };
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest("input, textarea, select")) return;
            if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
                toggle();
                return;
            }
            if (e.key === "Shift" || e.key === "Tab") return;
            // Enter/mezerník na tlačítku FSD ho jen zmáčkne; ostatní klávesy řídí
            if ((e.key === "Enter" || e.key === " ") && target.closest("[data-fsd]")) return;
            if (onRef.current) disengage("fsd.takeover");
        };
        window.addEventListener("keydown", onKey);
        // kolečko scrolluje stránku vždycky — i nad tlačítkem FSD
        const onWheel = () => onRef.current && disengage("fsd.takeover");
        window.addEventListener("wheel", onWheel, {passive: true});
        window.addEventListener("touchstart", takeover, {passive: true});
        window.addEventListener("pointerdown", takeover);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("wheel", onWheel);
            window.removeEventListener("touchstart", takeover);
            window.removeEventListener("pointerdown", takeover);
        };
    }, [toggle, disengage]);

    // hra nebo město přebírá kameru
    useEffect(() => {
        if (blocked && !gameRef.current && !placeRef.current) disengage("fsd.off");
    }, [blocked, disengage]);

    useEffect(() => () => {
        runRef.current++;
        window.clearTimeout(messageTimer.current);
        hush();
    }, []);

    return {on, step, text, voice, message, toggle, toggleVoice, stop};
}

/** volant (zjednodušený, jako ikona FSD v Tesle) */
export const WheelIcon: React.FC<{className?: string}> = ({className}) => (
    <svg className={className} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2"/>
        <circle cx="12" cy="13" r="2.2" fill="currentColor"/>
        <path d="M2.8 11.2 C6 9.6 18 9.6 21.2 11.2 M10.2 14.6 L7.6 21 M13.8 14.6 L16.4 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
);

export const FsdButton: React.FC<{fsd: FsdState; label: string}> = ({fsd, label}) => (
    <button
        type="button"
        data-fsd
        className={`${style.fsdBtn} ${fsd.on ? style.fsdBtnOn : ""}`}
        onClick={fsd.toggle}
        aria-pressed={fsd.on}
        aria-keyshortcuts="F"
        title={label}
    >
        <WheelIcon/> FSD
    </button>
);

/** spodní lišta během jízdy: titulek, postup trasy, hlas, převzít řízení */
export const FsdOverlay: React.FC<{fsd: FsdState; t: (key: string) => string}> = ({fsd, t}) => (
    <>
        {fsd.on && (
            <>
                <div className={style.fsdGlow} aria-hidden="true"/>
                <div className={style.fsdBar} data-fsd role="region" aria-label={t("fsd.title")}>
                    <div className={style.fsdHead}>
                        <span className={style.fsdBadge}><WheelIcon/> {t("fsd.title")}</span>
                        <span className={style.fsdStep}>{fsd.step + 1}/{ROUTE.length}</span>
                        <div className={style.fsdActions}>
                            <button type="button" className={style.fsdIconBtn} onClick={fsd.toggleVoice} aria-pressed={fsd.voice} title={t("fsd.voice")}>
                                {fsd.voice ? "🔊" : "🔇"}
                            </button>
                            <button type="button" className={style.fsdStop} onClick={fsd.stop}>{t("fsd.stop")}</button>
                        </div>
                    </div>
                    <p className={style.fsdText} key={fsd.step} aria-live="polite">{fsd.text || "…"}</p>
                    <ol className={style.fsdRoute} aria-hidden="true">
                        {ROUTE.map((_, i) => (
                            <li key={i} className={i < fsd.step ? style.fsdDone : i === fsd.step ? style.fsdNow : undefined}/>
                        ))}
                    </ol>
                </div>
            </>
        )}
        {fsd.message && <div className={style.fsdToast} role="status"><WheelIcon/> {fsd.message}</div>}
    </>
);
