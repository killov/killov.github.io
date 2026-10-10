"use client"

import React, {useCallback, useEffect, useRef, useState} from "react"
import style from './style.module.scss';
import photo from './zdenek.jpg'
import worldeeLogo from "./img/worldee_com_logo.jpg"
import quadientLogo from "./img/quadient_logo.jpg"
import upLogo from './up.png'
import spseLogo from './spse.png'
import {LanguageProvider, useLanguage} from "./LanguageContext";
import {FsdButton, FsdOverlay, useFsd} from "./Fsd";
import {playBlip, playTransition, useSound} from "./sound";
import {LANG_PATH, Lang} from "./i18n";
import {
    ProjectKind,
    about,
    education,
    experience,
    profile,
    projects,
    stack,
} from "./data/profile";
import {STATIONS, VH_PER_STATION, holdAtStations, readTrack, stationScroll, PanelPlacement} from "./scene/stations";
import type {CityCommand, FrameState, GameCommand, PanelLayout, Universe} from "./scene/Universe";
import {placeById, places} from "./data/places";
import type {GameEvent, GameFocus, GameTarget} from "./scene/solar";

/*
 * Web jako let kolem holografické Země. Stránka se fyzicky scrolluje
 * (vysoký spacer), ale obsah je fixní: scroll jen posouvá kameru ve 3D
 * scéně. Panely se sekcemi visí ve 3D prostoru (CSS matrix3d synchronní
 * s WebGL kamerou), projekty se dají otevřít jako 3D hologram.
 * Veškerý text je pořád v DOM — čitelné pro vyhledávače i AI.
 */

const LAST = STATIONS.length - 1;

const NAV_KEYS: Record<string, string> = {
    hero: "nav.hero",
    about: "nav.about",
    stack: "nav.stack",
    projects: "nav.projects",
    experience: "nav.experience",
    education: "nav.education",
    contact: "nav.contact",
};

const placementClass: Record<PanelPlacement, string> = {
    left: style.placeLeft,
    right: style.placeRight,
    wide: style.placeWide,
    horizon: style.placeHorizon,
    center: style.placeCenter,
};

const projectKindClass: Record<ProjectKind, string> = {
    work: style.kindWork,
    oss: style.kindOss,
    ai: style.kindAi,
    game: style.kindGame,
};

const projectId = (title: string) => title.toLowerCase();

const GAME_BODIES: Array<GameTarget | "earth"> = ["earth", "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

/** co se otevře jako 3D hologram: projekt, kategorie stacku nebo kartička z "O mně" */
type ShowcaseKey =
    | {kind: "project"; index: number}
    | {kind: "stack"; index: number}
    | {kind: "about"; id: string};

interface ShowcaseView {
    scene: string;
    title: string;
    badge: string;
    badgeClass: string;
    bullets: string[];
    tags: string[];
    href?: string;
    hrefLabel?: string;
    labels: string[];
    image?: string;
}

const N3 = [1, 2, 3];

// three.js (velký chunk) se začne stahovat hned při načtení modulu, souběžně s hydratací
const universeModule = typeof window === "undefined" ? null : import("./scene/Universe");

/** na dotykovém displeji nápověda bez myši a klávesnice (klíč + ".touch") */
const touchKey = (key: string) =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches ? `${key}.touch` : key;

function resolveShowcase(key: ShowcaseKey, t: (k: string) => string): ShowcaseView {
    if (key.kind === "project") {
        const p = projects[key.index];
        const id = projectId(p.title);
        return {
            scene: id, title: p.title, badge: t(`projects.kind.${p.kind}`), badgeClass: projectKindClass[p.kind],
            bullets: N3.map((n) => t(`projects.${id}.b${n}`)), tags: p.tags, href: p.href, hrefLabel: t("projects.visit"),
            labels: N3.map((n) => t(`projects.${id}.l${n}`)),
        };
    }
    if (key.kind === "stack") {
        const cat = stack[key.index];
        const scene = `stack-${cat.id}`;
        return {
            scene, title: t(cat.titleKey),
            badge: t(cat.level === "expert" ? "stack.level.expert" : "stack.level.strong"),
            badgeClass: cat.level === "expert" ? style.badgeExpert : style.badgeStrong,
            bullets: N3.map((n) => t(`sc.${scene}.b${n}`)), tags: cat.tags,
            labels: N3.map((n) => t(`sc.${scene}.l${n}`)),
        };
    }
    const scene = `about-${key.id}`;
    return {
        scene, title: t(`sc.${scene}.title`), badge: t("sc.badge.about"), badgeClass: style.kindOss,
        bullets: N3.map((n) => t(`sc.${scene}.b${n}`)), tags: [],
        href: key.id === "repos" ? profile.github : undefined,
        hrefLabel: "GitHub",
        // hvězdná mapa má navíc názvy dalších souhvězdí
        labels: (key.id === "stars" ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : N3).map((n) => t(`sc.${scene}.l${n}`)),
        image: key.id === "pilot" ? photo.src : undefined,
    };
}

/** props pro kartičku, která po kliknutí (nebo Enteru) otevře 3D hologram */
const clickable = (open: () => void, label: string) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
        }
    },
});

const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatNumber = (n: number) => n.toLocaleString("cs-CZ").replace(/[  ]/g, " ");

/** props pro prvek, který při aktivaci panelu naskočí; i = pořadí */
const item = (i: number) => ({
    className: style.item,
    style: {"--i": i} as React.CSSProperties,
});

/**
 * Kde má panel viset, když kamera dorazí na zastávku (střed v NDC + natočení).
 * Na desktopu vlevo/vpravo od planety a stočený ke středu, na mobilu dole.
 */
function panelLayout(placement: PanelPlacement, w: number, h: number): PanelLayout {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const margin = (vw: number, min: number) => Math.max(W * vw, min);
    let cx = W / 2;
    let cy = H / 2 + 10;
    let yaw = 0;
    if (W <= 800) {
        // spodek panelu nad ukazatelem letu; h je skutečná výška (CSS ji omezí na viditelnou plochu)
        cy = H - 84 - Math.min(h, H - 190) / 2;
    } else if (placement === "left") {
        cx = margin(0.05, 40) + w / 2;
        yaw = 0.16;
    } else if (placement === "right") {
        cx = W - margin(0.05, 40) - w / 2;
        yaw = -0.16;
    } else if (placement === "wide") {
        cx = margin(0.04, 32) + w / 2;
        cy = H / 2 - 6;
        yaw = 0.07;
    } else if (placement === "horizon") {
        cx = margin(0.06, 40) + w / 2;
        cy = 96 + h / 2;
        yaw = 0.12;
    }
    return {ndcX: (cx / W) * 2 - 1, ndcY: -((cy / H) * 2 - 1), yaw};
}

/**
 * Číslo se dopočítá od nuly pokaždé, když se panel aktivuje.
 * Na serveru a bez animací ukazuje rovnou finální hodnotu.
 */
const CountUp: React.FC<{value: string; run: boolean}> = ({value, run}) => {
    const [shown, setShown] = useState(value);
    useEffect(() => {
        const match = value.match(/^(\D*)([\d\s]+)(.*)$/);
        if (!run || !match || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setShown(value);
            return;
        }
        const target = parseInt(match[2].replace(/\s/g, ""), 10);
        const format = (n: number) => `${match[1]}${formatNumber(n)}${match[3]}`;
        const start = performance.now() + 350;
        let frame = 0;
        const tick = (now: number) => {
            const p = Math.max(0, Math.min((now - start) / 1500, 1));
            setShown(format(Math.round(target * (1 - Math.pow(1 - p, 4)))));
            if (p < 1) frame = requestAnimationFrame(tick);
        };
        setShown(format(0));
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [value, run]);
    return <>{shown}</>;
};

const MachineReadableProfile: React.FC = () => {
    const {t} = useLanguage();
    return (
        <section aria-hidden="true" data-ai-summary="true" className={style.aiSummary}>
            <h2>{t("ai.heading")}</h2>
            <p>
                <strong>Jméno:</strong> Zdeněk Mazurák (killov).{" "}
                <strong>Role:</strong> {t("hero.role")}.{" "}
                <strong>Lokalita:</strong> {t("contact.location.value")}.
            </p>
            <p>
                <strong>Zkušenosti:</strong> programuje od 12 let, nejvíc ho baví realtime webové aplikace, teď se zaměřuje na AI a posouvání jejích limitů. 6+ let v produkci. Backend vývojář ve Worldee.com od 2019.{" "}
                <strong>Expert:</strong> PHP 8.4, Nette, TypeScript, Node.js.{" "}
                <strong>Strong:</strong> C#/.NET, React, MobX, Next.js, AWS, Docker, MySQL, PostgreSQL, Redis, ScyllaDB.
            </p>
            <p>
                <strong>Vlastní projekty:</strong> WorkMux (cloudový AI orchestrátor pro vývojáře, www.workmux.com), Drive (multiplayer 3D jízda po Česku, drive.in.workmux.com), Ironbean (DI knihovna na npm, 7⭐), OverCup a ArmyGame (online hry, zatím nevydané).
            </p>
            <p>
                <strong>Kontakt:</strong> z.mazurak35@gmail.com · github.com/killov.
            </p>
        </section>
    );
};

/** holografický panel ve 3D: rohové závorky, hlavička se sektorem, skenovací linka */
const Panel = React.forwardRef<HTMLElement, {
    index: number;
    title: string;
    active: boolean;
    children: React.ReactNode;
}>(({index, title, active, children}, ref) => {
    const station = STATIONS[index];
    return (
        <section
            ref={ref}
            id={station.id === "hero" ? undefined : station.id}
            aria-label={title}
            className={`${style.panel} ${placementClass[station.placement]}`}
            data-active={active}
        >
            <div className={style.frame}>
                <span className={`${style.corner} ${style.cornerTl}`} aria-hidden="true"/>
                <span className={`${style.corner} ${style.cornerTr}`} aria-hidden="true"/>
                <span className={`${style.corner} ${style.cornerBl}`} aria-hidden="true"/>
                <span className={`${style.corner} ${style.cornerBr}`} aria-hidden="true"/>
                <span className={style.scan} aria-hidden="true"/>
                <div className={style.panelHeader} aria-hidden="true">
                    <span className={style.panelHeaderDot}/>
                    <span>SEC.{pad2(index)} {"//"} {title.toUpperCase()}</span>
                    <span className={style.panelHeaderCode}>0x{(0x3a + index * 0x17).toString(16).toUpperCase()} · LOCK</span>
                </div>
                <div className={style.panelContent}>
                    {children}
                </div>
            </div>
        </section>
    );
});
Panel.displayName = "Panel";

const SectionTitle: React.FC<{index: number; title: string}> = ({index, title}) => (
    <div className={`${style.titleRow} ${style.item}`} style={{"--i": 0} as React.CSSProperties}>
        <span className={style.titleIndex} aria-hidden="true">{pad2(index)}</span>
        <h2 className={style.h2}>{title}</h2>
    </div>
);

const BootSequence: React.FC = () => {
    const {t} = useLanguage();
    const lines = ["hud.boot.1", "hud.boot.2", "hud.boot.3", "hud.boot.4", "hud.boot.5"];
    return (
        <div className={style.boot} aria-hidden="true">
            <div className={style.bootInner}>
                <div className={style.bootLogo}>◢ KILLOV.OS <span>v7.0</span></div>
                {lines.map((key, i) => (
                    <div key={key} className={style.bootLine} style={{"--i": i} as React.CSSProperties}>
                        <span className={style.bootPrompt}>&gt;</span> {t(key)}
                        {i < 3 && <span className={style.bootOk}> ……… OK</span>}
                    </div>
                ))}
                <div className={style.bootBar}><span/></div>
            </div>
        </div>
    );
};

/** skutečné odkazy na / a /en/ (ať je vyhledávače najdou), přepnutí ale proběhne bez reloadu 3D scény */
const LangSwitch: React.FC = () => {
    const {lang, setLang} = useLanguage();
    const link = (to: Lang, text: string) => (
        <a
            href={LANG_PATH[to]}
            hrefLang={to}
            className={`${style.langBtn} ${lang === to ? style.langBtnActive : ""}`}
            aria-current={lang === to ? "page" : undefined}
            data-lang={to}
            onClick={(e) => { e.preventDefault(); setLang(to); }}
        >{text}</a>
    );
    return (
        <div className={style.langSwitch} role="group" aria-label="Language">
            {link("cs", "CZ")}
            <span className={style.langDivider} aria-hidden="true">/</span>
            {link("en", "EN")}
        </div>
    );
};

/** popis otevřeného projektu vedle 3D hologramu — krátce, ať to není čtení */
const ShowcaseCard: React.FC<{view: ShowcaseView; onClose: () => void}> = ({view, onClose}) => {
    const {t} = useLanguage();
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        closeRef.current?.focus({preventScroll: true});
    }, [view.scene]);
    return (
        <div className={style.showcase} role="dialog" aria-modal="true" aria-label={view.title}>
            <div className={style.showcaseCard} key={view.scene}>
                <span className={`${style.badge} ${view.badgeClass}`}>{view.badge}</span>
                <h3 className={style.showcaseTitle}>{view.title}</h3>
                <ul className={style.showcaseList}>
                    {view.bullets.map((b, n) => (
                        <li key={n} style={{"--i": n + 1} as React.CSSProperties}>{b}</li>
                    ))}
                </ul>
                {view.tags.length > 0 && (
                    <ul className={style.tagWrap}>
                        {view.tags.map((tag) => <li key={tag} className={style.tag}>{tag}</li>)}
                    </ul>
                )}
                <div className={style.showcaseActions}>
                    {view.href && (
                        <a className={style.btnPrimary} href={view.href} target="_blank" rel="noreferrer">{view.hrefLabel} →</a>
                    )}
                    <button ref={closeRef} type="button" className={style.btnGhost} onClick={onClose}>
                        {t("showcase.close")} ✕
                    </button>
                </div>
                <p className={style.showcaseHint}>{t("showcase.hint")}</p>
            </div>
        </div>
    );
};

const SPEEDS: Array<{key: string; value: number}> = [
    {key: "game.pause", value: 0},
    {key: "game.speed.1", value: 1},
    {key: "game.speed.h", value: 3600},
    {key: "game.speed.d", value: 86400},
    {key: "game.speed.w", value: 604800},
    {key: "game.speed.m", value: 2629800},
];

const pragueHourFormat = typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("en-GB", {timeZone: "Europe/Prague", hour: "numeric", minute: "numeric", hourCycle: "h23"})
    : null;

/** hodina v Olomouci (0–24) pro daný čas */
function pragueHour(ms: number): number {
    if (!pragueHourFormat) return new Date(ms).getHours();
    const parts = pragueHourFormat.formatToParts(new Date(ms));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h + m / 60;
}

interface GameRefs {
    clock: React.RefObject<HTMLSpanElement>;
    hour: React.RefObject<HTMLInputElement>;
    hits: React.RefObject<HTMLSpanElement>;
    throws: React.RefObject<HTMLSpanElement>;
    rockets: React.RefObject<HTMLSpanElement>;
    simTime: React.MutableRefObject<number>;
    hourDragging: React.MutableRefObject<boolean>;
}

/** ovládání vesmírné hry: čas, pohled, rakety, skóre */
const GameHud: React.FC<{refs: GameRefs; command: (c: GameCommand) => void; onExit: () => void; toast: {id: number; text: string; kind: GameEvent["kind"]} | null}> = ({refs, command, onExit, toast}) => {
    const {t} = useLanguage();
    const [speed, setSpeed] = useState(3600);
    const [focus, setFocus] = useState<GameFocus>("earth");
    const exitRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        exitRef.current?.focus({preventScroll: true});
    }, []);
    const pickSpeed = (value: number) => {
        setSpeed(value);
        command({type: "speed", value});
    };
    const pickFocus = (value: GameFocus) => {
        setFocus(value);
        command({type: "focus", value});
    };
    return (
        <div className={style.game} role="dialog" aria-modal="false" aria-label={t("game.title")}>
            <div className={style.gameTop}>
                <div className={style.gameTitle}>☄ {t("game.title")}</div>
                <div className={style.gameHow}>{t("game.howto")}</div>
                <div className={style.gameHowSub}>{t(touchKey("game.drag"))}</div>
            </div>
            <button ref={exitRef} type="button" className={`${style.btnGhost} ${style.gameExit}`} onClick={onExit}>
                ✕ {t("game.exit")}
            </button>

            <div className={style.gameScore} aria-live="polite">
                <div><span className={style.telKey}>{t("game.hits")}</span> <span ref={refs.hits}>0</span></div>
                <div><span className={style.telKey}>{t("game.throws")}</span> <span ref={refs.throws}>0</span></div>
                <div><span className={style.telKey}>{t("game.rockets")}</span> <span ref={refs.rockets}>0</span></div>
            </div>

            <div className={style.gameSide}>
                <button type="button" className={style.gameRocket} onClick={() => command({type: "rocket"})}>
                    🚀 {t("game.rocket")}
                </button>
                <div className={style.gameLabel}>{t("game.view")}</div>
                <div className={style.gameSeg} role="group" aria-label={t("game.view")}>
                    {(["earth", "sun", "system"] as GameFocus[]).map((f) => (
                        <button key={f} type="button" aria-pressed={focus === f} className={focus === f ? style.gameSegActive : ""} onClick={() => pickFocus(f)}>
                            {t(`game.focus.${f}`)}
                        </button>
                    ))}
                </div>
            </div>

            <div className={style.gameTime}>
                <div className={style.gameClock}>
                    <span className={style.telKey}>{t("game.time")}</span> <span ref={refs.clock}>—</span>
                </div>
                <div className={style.gameSeg} role="group" aria-label={t("game.time")}>
                    {SPEEDS.map((sp) => (
                        <button key={sp.key} type="button" aria-pressed={speed === sp.value} className={speed === sp.value ? style.gameSegActive : ""} onClick={() => pickSpeed(sp.value)}>
                            {sp.value === 0 ? "⏸" : t(sp.key)}
                        </button>
                    ))}
                    <button type="button" onClick={() => {
                        command({type: "time", value: Date.now()});
                        pickSpeed(1);
                    }}>⟲ {t("game.now")}</button>
                </div>
                <label className={style.gameHour}>
                    <span className={style.telKey}>{t("game.hour")}</span>
                    <input
                        ref={refs.hour}
                        type="range"
                        min={0}
                        max={24}
                        step={0.25}
                        defaultValue={12}
                        onPointerDown={() => (refs.hourDragging.current = true)}
                        onPointerUp={() => (refs.hourDragging.current = false)}
                        onBlur={() => (refs.hourDragging.current = false)}
                        onChange={(e) => {
                            const now = refs.simTime.current;
                            const delta = Number(e.target.value) - pragueHour(now);
                            command({type: "time", value: now + delta * 3600000});
                        }}
                    />
                </label>
            </div>

            {toast && (
                <div key={toast.id} className={`${style.gameToast} ${toast.kind === "hit" ? style.gameToastHit : ""}`} role="status">
                    {toast.text}
                </div>
            )}
        </div>
    );
};

interface CityRefs {
    speed: React.RefObject<HTMLSpanElement>;
    nav: React.RefObject<HTMLSpanElement>;
}

/** ovládání 3D města: místa, řízení, dotykové ovládání auta */
const CityHud: React.FC<{
    refs: CityRefs;
    place: string;
    driving: boolean;
    loading: boolean;
    toast: string | null;
    command: (c: CityCommand) => void;
    onExit: () => void;
    onPlace: (id: string) => void;
}> = ({refs, place, driving, loading, toast, command, onExit, onPlace}) => {
    const {t} = useLanguage();
    const p = placeById(place);
    const backRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        backRef.current?.focus({preventScroll: true});
    }, []);
    const touch = (throttle: number, steer: number) => ({
        onPointerDown: (e: React.PointerEvent) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            command({type: "touch", throttle, steer});
        },
        onPointerUp: () => command({type: "touch", throttle: 0, steer: 0}),
        onPointerCancel: () => command({type: "touch", throttle: 0, steer: 0}),
    });
    return (
        <div className={style.city} role="dialog" aria-modal="false" aria-label={p ? t(p.nameKey) : ""}>
            <div className={style.cityCard}>
                <div className={style.cityKicker}>⌖ {p?.short ?? ""}</div>
                <h3 className={style.cityTitle}>{p ? t(p.nameKey) : ""}</h3>
                <div className={style.cityAddr}>{p?.address}</div>
                <div className={style.gameLabel}>{driving ? t("city.goto") : t("city.places")}</div>
                <div className={style.cityPlaces}>
                    {places.map((pl) => (
                        <button key={pl.id} type="button" aria-pressed={pl.id === place} className={pl.id === place ? style.gameSegActive : ""} onClick={() => onPlace(pl.id)}>
                            {pl.short}
                        </button>
                    ))}
                </div>
                <div className={style.cityHelp}>{loading ? t("city.loading") : driving ? t(touchKey("city.help")) : t(touchKey("city.orbit"))}</div>
            </div>

            <div className={style.citySide}>
                <button ref={backRef} type="button" className={style.btnGhost} onClick={onExit}>🌍 {t("city.back")}</button>
                {!loading && (
                    <button type="button" className={style.gameRocket} onClick={() => command({type: "drive", value: !driving})}>
                        {driving ? `🅿 ${t("city.park")}` : `🚗 ${t("city.drive")}`}
                    </button>
                )}
            </div>

            {driving && (
                <>
                    <div className={style.citySpeed} aria-hidden="true">
                        <span ref={refs.speed}>0</span><small>km/h</small>
                        <span ref={refs.nav} className={style.cityNav}/>
                    </div>
                    <div className={style.cityPad} aria-hidden="true">
                        <button type="button" {...touch(0, 1)}>◀</button>
                        <button type="button" {...touch(0, -1)}>▶</button>
                        <span/>
                        <button type="button" {...touch(-1, 0)}>▼</button>
                        <button type="button" {...touch(1, 0)}>▲</button>
                    </div>
                </>
            )}

            {toast && <div className={`${style.gameToast} ${style.gameToastHit}`} role="status">{toast}</div>}
            <div className={style.cityAttr}>{t("city.attr")}</div>
        </div>
    );
};

function Experience() {
    const {t, lang} = useLanguage();
    const [active, setActive] = useState(0);
    const [showcase, setShowcase] = useState<ShowcaseKey | null>(null);
    const [game, setGame] = useState(false);
    const [toast, setToast] = useState<{id: number; text: string; kind: GameEvent["kind"]} | null>(null);
    const activeRef = useRef(0);
    /** kolik px textu se do panelu nevejde (dočítá se scrollem stránky) */
    const readsRef = useRef<number[]>(STATIONS.map(() => 0));
    const [readExtra, setReadExtra] = useState(0);
    const showcaseRef = useRef<ShowcaseKey | null>(null);
    const gameRef = useRef(false);
    const [city, setCity] = useState<{place: string; driving: boolean; loading: boolean} | null>(null);
    const [cityToast, setCityToast] = useState<string | null>(null);
    const cityRef = useRef<{place: string; driving: boolean; loading: boolean} | null>(null);
    const arrivedRef = useRef(0);
    const cityRefs: CityRefs = {speed: useRef<HTMLSpanElement>(null), nav: useRef<HTMLSpanElement>(null)};
    const cityRefsRef = useRef(cityRefs);
    cityRefsRef.current = cityRefs;
    const lastEventRef = useRef(0);
    const toastTimer = useRef(0);
    const clockTextRef = useRef("");
    const gameRefs: GameRefs = {
        clock: useRef<HTMLSpanElement>(null),
        hour: useRef<HTMLInputElement>(null),
        hits: useRef<HTMLSpanElement>(null),
        throws: useRef<HTMLSpanElement>(null),
        rockets: useRef<HTMLSpanElement>(null),
        simTime: useRef(0),
        hourDragging: useRef(false),
    };
    const gameRefsRef = useRef(gameRefs);
    gameRefsRef.current = gameRefs;
    const langRef = useRef(lang);
    langRef.current = lang;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stageRef = useRef<HTMLElement>(null);
    const cam3dRef = useRef<HTMLDivElement>(null);
    const universeRef = useRef<Universe | null>(null);
    const panelRefs = useRef<Array<HTMLElement | null>>([]);
    const linkRef = useRef<SVGPathElement>(null);
    const lockRef = useRef<SVGGElement>(null);
    const altRef = useRef<HTMLSpanElement>(null);
    const coordRef = useRef<HTMLSpanElement>(null);
    const velRef = useRef<HTMLSpanElement>(null);
    const pctRef = useRef<HTMLSpanElement>(null);
    const dialRef = useRef<SVGCircleElement>(null);
    const hintRef = useRef<HTMLDivElement>(null);
    const reducedRef = useRef(false);
    const tRef = useRef(t);
    tRef.current = t;

    /** posun kamery = skutečný scroll; vrací cílový scrollY pro zastávku */
    const scrollForStation = (i: number) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return stationScroll(i, max, readsRef.current);
    };

    const goTo = useCallback((i: number) => {
        const index = Math.min(Math.max(i, 0), LAST);
        window.scrollTo({top: scrollForStation(index), behavior: reducedRef.current ? "auto" : "smooth"});
        const id = STATIONS[index].id;
        history.replaceState(null, "", id === "hero" ? location.pathname : `#${id}`);
    }, []);

    const openShowcase = useCallback((key: ShowcaseKey) => {
        const view = resolveShowcase(key, tRef.current);
        playBlip();
        universeRef.current?.openShowcase(view.scene, view.labels, view.image);
        showcaseRef.current = key;
        setShowcase(key);
        // během hologramu se nescrolluje
        document.documentElement.style.overflow = "hidden";
    }, []);

    const openProject = useCallback((i: number) => openShowcase({kind: "project", index: i}), [openShowcase]);

    const closeProject = useCallback(() => {
        universeRef.current?.closeShowcase();
        showcaseRef.current = null;
        setShowcase(null);
        document.documentElement.style.overflow = "";
    }, []);

    const enterGame = useCallback(() => {
        const universe = universeRef.current;
        if (!universe) return;
        if (showcaseRef.current !== null) {
            universe.closeShowcase();
            showcaseRef.current = null;
            setShowcase(null);
        }
        universe.enterGame();
        gameRef.current = true;
        setGame(true);
        document.documentElement.style.overflow = "hidden";
    }, []);

    const exitGame = useCallback(() => {
        universeRef.current?.exitGame();
        gameRef.current = false;
        setGame(false);
        setToast(null);
        document.documentElement.style.overflow = "";
    }, []);

    const openPlace = useCallback((id: string) => {
        const universe = universeRef.current;
        const p = placeById(id);
        if (!universe || !p) return;
        universe.enterPlace(id, p.lat, p.lon, Object.fromEntries(places.map((pl) => [pl.id, pl.short])));
        if (!cityRef.current) {
            cityRef.current = {place: id, driving: false, loading: true};
            setCity(cityRef.current);
            arrivedRef.current = 0;
        }
        document.documentElement.style.overflow = "hidden";
    }, []);

    const exitPlace = useCallback(() => {
        universeRef.current?.exitPlace();
        cityRef.current = null;
        setCity(null);
        setCityToast(null);
        document.documentElement.style.overflow = "";
    }, []);

    const cityCommand = useCallback((cmd: CityCommand) => universeRef.current?.cityCommand(cmd), []);

    const cityPlace = useCallback((id: string) => {
        const c = cityRef.current;
        if (!c) return;
        if (c.driving) universeRef.current?.cityCommand({type: "target", value: id});
        else universeRef.current?.cityCommand({type: "focus", value: id});
        cityRef.current = {...c, place: id};
        setCity(cityRef.current);
    }, []);

    const gameCommand = useCallback((cmd: GameCommand) => universeRef.current?.gameCommand(cmd), []);

    const fsd = useFsd({
        goTo, openShowcase, closeShowcase: closeProject, enterGame, exitGame, openPlace, exitPlace, gameCommand,
        activeRef, t, lang, blocked: game || city !== null,
    });
    const [sound, toggleSound] = useSound();

    // přelet do jiné sekce = „tik-tak“ (ne při načtení stránky)
    const soundedRef = useRef(active);
    useEffect(() => {
        if (soundedRef.current === active) return;
        soundedRef.current = active;
        if (showcase === null && !game && city === null) playTransition();
    }, [active]); // eslint-disable-line react-hooks/exhaustive-deps


    const layoutPanels = useCallback(() => {
        // přesah textu panelů (na desktopu 0 — panel se vejde celý)
        // (měří se obsah, ne scrollHeight — ten nafukuje animovaná skenovací linka)
        readsRef.current = panelRefs.current.map((el) => {
            const frame = el?.querySelector<HTMLElement>(`.${style.frame}`);
            const content = frame?.querySelector<HTMLElement>(`.${style.panelContent}`);
            if (!frame || !content) return 0;
            const px = (v: string) => parseFloat(v) || 0;
            // + přechod "pokračuje dál" (::after za obsahem, jen na mobilu)
            const fade = getComputedStyle(frame, "::after");
            const fadeH = fade.content && fade.content !== "none" ? px(fade.height) + px(fade.marginTop) + px(fade.marginBottom) : 0;
            const end = content.offsetTop + content.offsetHeight + fadeH + px(getComputedStyle(frame).paddingBottom);
            return Math.max(0, Math.ceil(end - frame.clientHeight));
        });
        setReadExtra(readsRef.current.reduce((a, b) => a + b, 0));
        const universe = universeRef.current;
        if (!universe) return;
        universe.setPanelLayouts(STATIONS.map((s, i) => {
            const el = panelRefs.current[i];
            return panelLayout(s.placement, el?.offsetWidth ?? 500, el?.offsetHeight ?? 400);
        }));
    }, []);

    const onFrame = useCallback((state: FrameState) => {
        const {progress, marker, css} = state;
        const current = Math.round(progress);

        // čtení layoutu před zápisy (žádný vynucený reflow v rámci snímku)
        const rect = panelRefs.current[current]?.getBoundingClientRect();

        if (stageRef.current && css.perspective) stageRef.current.style.perspective = `${css.perspective}px`;
        if (cam3dRef.current) cam3dRef.current.style.transform = css.camera;

        panelRefs.current.forEach((el, i) => {
            if (!el) return;
            const p = css.panels[i];
            const depth = p ? p.depth : 0;
            const vis = (1 - smoothstep(0.22, 0.6, Math.abs(progress - i))) * smoothstep(1.5, 5, depth);
            const hidden = vis < 0.01 || !p;
            el.style.opacity = vis.toFixed(3);
            el.style.visibility = hidden ? "hidden" : "visible";
            if (!hidden) el.style.transform = p.transform;
        });

        if (current !== activeRef.current) {
            activeRef.current = current;
            setActive(current);
        }

        // spojnice panel → Olomouc na Zemi
        const link = linkRef.current;
        const lock = lockRef.current;
        const near = 1 - smoothstep(0.05, 0.3, Math.abs(progress - current));
        if (link && lock) {
            if (marker && rect && rect.width > 0 && near > 0.02) {
                const toRight = marker.x > rect.right;
                const ax = toRight ? rect.right : rect.left;
                const ay = Math.min(Math.max(marker.y, rect.top + 48), rect.bottom - 48);
                const ex = ax + (toRight ? 36 : -36);
                link.setAttribute("d", `M${ax},${ay} L${ex},${ay} L${marker.x},${marker.y}`);
                link.style.opacity = near.toFixed(3);
                lock.setAttribute("transform", `translate(${marker.x.toFixed(1)} ${marker.y.toFixed(1)})`);
                lock.style.opacity = near.toFixed(3);
            } else {
                link.style.opacity = "0";
                lock.style.opacity = "0";
            }
        }

        // telemetrie
        if (altRef.current) altRef.current.textContent = `${formatNumber(Math.round(state.altitude * 637))} km`;
        if (coordRef.current) coordRef.current.textContent = `${state.lat.toFixed(2)}° / ${state.lon.toFixed(2)}°`;
        if (velRef.current) velRef.current.textContent = `${Math.abs(state.velocity * 7.9).toFixed(2)} km/s`;
        const pct = progress / LAST;
        if (pctRef.current) pctRef.current.textContent = `${Math.round(pct * 100)}%`;
        if (dialRef.current) dialRef.current.style.strokeDashoffset = String(163.4 * (1 - pct));
        if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - progress * 5));

        // 3D město: rychlost, navigace, změna stavu
        const c = state.city;
        if (c && cityRef.current) {
            const prev = cityRef.current;
            const place = c.driving ? (c.target ?? c.place) : prev.place;
            if (prev.loading !== c.loading || prev.driving !== c.driving || prev.place !== place) {
                cityRef.current = {place, driving: c.driving, loading: c.loading};
                setCity(cityRef.current);
            }
            const refs = cityRefsRef.current;
            if (refs.speed.current) refs.speed.current.textContent = String(Math.round(c.speed));
            if (refs.nav.current) {
                const target = c.target ? placeById(c.target) : null;
                refs.nav.current.textContent = target ? `→ ${target.short} · ${c.targetDist > 1000 ? (c.targetDist / 1000).toFixed(1) + " km" : Math.round(c.targetDist) + " m"}` : "";
            }
            if (c.arrived > arrivedRef.current) {
                arrivedRef.current = c.arrived;
                const p = placeById(c.place);
                setCityToast(tRef.current("city.arrived").replace("{x}", p ? p.short : ""));
                window.clearTimeout(toastTimer.current);
                toastTimer.current = window.setTimeout(() => setCityToast(null), 3000);
            }
        }

        // herní HUD (bez re-renderu, jen texty)
        const g = state.game;
        if (g && gameRef.current) {
            const refs = gameRefsRef.current;
            refs.simTime.current = g.time;
            const text = new Date(g.time).toLocaleString(langRef.current === "cs" ? "cs-CZ" : "en-GB", {
                timeZone: "Europe/Prague", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
            });
            if (refs.clock.current && text !== clockTextRef.current) {
                clockTextRef.current = text;
                refs.clock.current.textContent = text;
            }
            if (refs.hour.current && !refs.hourDragging.current) refs.hour.current.value = String(pragueHour(g.time));
            if (refs.hits.current) refs.hits.current.textContent = String(g.hits);
            if (refs.throws.current) refs.throws.current.textContent = String(g.throws);
            if (refs.rockets.current) refs.rockets.current.textContent = String(g.rockets);
            const ev = g.event;
            if (ev && ev.id !== lastEventRef.current) {
                lastEventRef.current = ev.id;
                const tr = tRef.current;
                const text2 = tr(`game.ev.${ev.kind}`).replace("{x}", ev.target ? tr(`game.body.${ev.target}`) : "");
                setToast({id: ev.id, text: text2, kind: ev.kind});
                window.clearTimeout(toastTimer.current);
                toastTimer.current = window.setTimeout(() => setToast(null), ev.kind === "throw" ? 1200 : 3200);
            }
        }
    }, []);

    useEffect(() => {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        reducedRef.current = reduced;
        let disposed = false;
        let universe: Universe | null = null;

        const rawProgress = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            if (max <= 0) return 0;
            const {raw, offsets} = readTrack(window.scrollY, max, readsRef.current);
            // dlouhý panel: scroll stránky posouvá jeho text
            panelRefs.current.forEach((el, i) => {
                const frame = el?.querySelector<HTMLElement>(`.${style.frame}`);
                if (frame && frame.scrollTop !== offsets[i]) frame.scrollTop = offsets[i];
            });
            return raw;
        };
        const onScroll = () => universe?.setTarget(holdAtStations(rawProgress()));
        const onResize = () => {
            universe?.resize();
            layoutPanels();
            onScroll();
        };
        const onPointer = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            universe?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
        };
        const onKey = (e: KeyboardEvent) => {
            if (cityRef.current) {
                if (e.key === "Escape") exitPlace();
                return;
            }
            if (gameRef.current) {
                if (e.key === "Escape") exitGame();
                return;
            }
            if (showcaseRef.current !== null) {
                if (e.key === "Escape") closeProject();
                return;
            }
            const target = e.target as HTMLElement;
            if (target.closest("input, textarea, select, button, [role=button]")) return;
            if (e.key === "PageDown" || e.key === "ArrowRight" || (e.key === " " && !e.shiftKey)) {
                e.preventDefault();
                goTo(activeRef.current + 1);
            } else if (e.key === "PageUp" || e.key === "ArrowLeft" || (e.key === " " && e.shiftKey)) {
                e.preventDefault();
                goTo(activeRef.current - 1);
            } else if (e.key === "Home") {
                e.preventDefault();
                goTo(0);
            } else if (e.key === "End") {
                e.preventDefault();
                goTo(LAST);
            } else if (e.key === "g" || e.key === "G") {
                enterGame();
            }
        };

        // three.js se načte až na klientu (a odděleně od hlavního bundlu)
        (universeModule ?? import("./scene/Universe")).then(({Universe: U}) => {
            if (disposed || !canvasRef.current) return;
            universe = new U(canvasRef.current, {
                reducedMotion: reduced,
                projectTitles: projects.map((p) => p.title),
                onFrame,
                onSatellite: openProject,
                bodyNames: () => Object.fromEntries(GAME_BODIES.map((b) => [b, tRef.current(`game.body.${b}`)])) as Record<GameTarget | "earth", string>,
            });
            universeRef.current = universe;
            layoutPanels();
            const hashIndex = STATIONS.findIndex((s) => `#${s.id}` === location.hash);
            if (hashIndex > 0) {
                window.scrollTo({top: scrollForStation(hashIndex)});
                universe.jumpTo(hashIndex);
            } else {
                universe.jumpTo(holdAtStations(rawProgress()));
            }
        });

        // přesah textu se mění, až se načtou fonty a obrázky
        document.fonts?.ready.then(() => !disposed && onResize());
        window.addEventListener("load", onResize);
        window.addEventListener("scroll", onScroll, {passive: true});
        window.addEventListener("resize", onResize);
        window.addEventListener("pointermove", onPointer, {passive: true});
        window.addEventListener("keydown", onKey);
        return () => {
            disposed = true;
            universe?.dispose();
            universeRef.current = null;
            document.documentElement.style.overflow = "";
            window.clearTimeout(toastTimer.current);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("load", onResize);
            window.removeEventListener("pointermove", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    }, [goTo, onFrame, openProject, closeProject, layoutPanels, enterGame, exitGame, exitPlace]);

    // delší stránka (přesah textu) = jiný přepočet scrollu na kameru
    useEffect(() => {
        window.dispatchEvent(new Event("scroll"));
    }, [readExtra]);

    // jiný jazyk = jiné výšky panelů
    useEffect(() => {
        const frame = requestAnimationFrame(layoutPanels);
        return () => cancelAnimationFrame(frame);
    }, [lang, layoutPanels]);

    // neaktivní panely nejdou fokusovat klávesnicí
    useEffect(() => {
        panelRefs.current.forEach((el, i) => {
            if (!el) return;
            if (i === active && showcase === null && !game && !city) el.removeAttribute("inert");
            else el.setAttribute("inert", "");
        });
    }, [active, showcase, game, city]);

    const setPanelRef = (i: number) => (el: HTMLElement | null) => {
        panelRefs.current[i] = el;
    };

    const navLink = (i: number) => {
        const id = STATIONS[i].id;
        return (
            <a
                href={id === "hero" ? "#main" : `#${id}`}
                className={`${style.navLink} ${active === i ? style.navLinkActive : ""}`}
                aria-current={active === i ? "location" : undefined}
                onClick={(e) => {
                    e.preventDefault();
                    if (showcaseRef.current !== null) closeProject();
                    goTo(i);
                }}
            >
                <span className={style.navIndex} aria-hidden="true">{pad2(i)}</span>
                {t(NAV_KEYS[id])}
            </a>
        );
    };

    const nextId = STATIONS[Math.min(active + 1, LAST)].id;

    return (
        <div className={style.layout} data-showcase={showcase !== null} data-game={game || city !== null} data-fsd={fsd.on}>
            <canvas ref={canvasRef} className={style.canvas} aria-hidden="true"/>
            <div className={style.vignette} aria-hidden="true"/>
            <div className={style.scanlines} aria-hidden="true"/>
            <div className={style.screenFrame} aria-hidden="true">
                <span/><span/><span/><span/>
            </div>

            <svg className={style.overlay} aria-hidden="true">
                <path ref={linkRef} className={style.linkLine}/>
                <g ref={lockRef} className={style.lock}>
                    <g className={style.lockSpin}>
                        <circle r="22" className={style.lockRing}/>
                        <path d="M-30 0 H-24 M24 0 H30 M0 -30 V-24 M0 24 V30" className={style.lockTicks}/>
                    </g>
                    <circle r="4" className={style.lockDot}/>
                    <text x="34" y="-14" className={style.lockLabel}>OLOMOUC · CZ</text>
                    <text x="34" y="0" className={style.lockSub}>49.59°N 17.25°E</text>
                </g>
            </svg>

            <header className={style.hud}>
                <a href="#main" className={style.brand} onClick={(e) => { e.preventDefault(); goTo(0); }}>
                    <span className={style.brandMark} aria-hidden="true">◢</span> KILLOV<span className={style.brandOs}>.OS</span>
                </a>
                <nav aria-label="Sekce webu">
                    <ul className={style.navList}>
                        {STATIONS.map((s, i) => <li key={s.id}>{navLink(i)}</li>)}
                    </ul>
                </nav>
                <div className={style.hudRight}>
                    <FsdButton fsd={fsd} label={t("fsd.hint")}/>
                    <button type="button" className={style.gameBtn} onClick={enterGame} aria-keyshortcuts="G">
                        <span aria-hidden="true">🚀</span> {t("hud.game")}
                    </button>
                    <button type="button" className={style.soundBtn} onClick={toggleSound} aria-pressed={sound} title={t("tf.sound")}>
                        <span aria-hidden="true">{sound ? "🔊" : "🔇"}</span> {t("tf.sound")}
                    </button>
                    <span className={style.status}><span className={style.statusDot}/>{t("hud.status")}</span>
                    <LangSwitch/>
                </div>
            </header>

            <main id="main" ref={stageRef} className={style.stage}>
                <div ref={cam3dRef} className={style.camera3d}>
                    {/* 00 — hero */}
                    <Panel ref={setPanelRef(0)} index={0} title={t("nav.hero")} active={active === 0}>
                        <p className={`${style.eyebrow} ${style.item}`} style={{"--i": 0} as React.CSSProperties}>
                            <span className={style.eyebrowDot} aria-hidden="true"/>
                            {t("hero.availability")}
                        </p>
                        <h1 className={`${style.heroName} ${style.item}`} style={{"--i": 1} as React.CSSProperties}><span className={style.heroDegree}>Bc.</span> Zdeněk Mazurák</h1>
                        <p className={`${style.heroRole} ${style.item}`} style={{"--i": 2} as React.CSSProperties}>{t("hero.role")}</p>
                        <p className={`${style.heroTagline} ${style.item}`} style={{"--i": 3} as React.CSSProperties}>{t("hero.tagline")}</p>
                        <div className={`${style.heroCta} ${style.item}`} style={{"--i": 4} as React.CSSProperties}>
                            <a className={style.btnPrimary} href={`mailto:${profile.emails[0]}`}>{t("hero.cta.contact")}</a>
                            <a className={style.btnGhost} href={profile.github} target="_blank" rel="noreferrer">
                                {t("hero.cta.github")} <span aria-hidden="true">→</span>
                            </a>
                        </div>
                    </Panel>

                    {/* 01 — o mně */}
                    <Panel ref={setPanelRef(1)} index={1} title={t("about.title")} active={active === 1}>
                        <SectionTitle index={1} title={t("about.title")}/>
                        <div className={style.aboutRow}>
                            <figure
                                className={`${style.pilot} ${style.item} ${style.open3d}`}
                                style={{"--i": 1} as React.CSSProperties}
                                {...clickable(() => openShowcase({kind: "about", id: "pilot"}), `${t("sc.about-pilot.title")} — ${t("projects.open3d")}`)}
                            >
                                <img src={photo.src} alt="Zdeněk Mazurák" width={132} height={168} loading="eager" decoding="async"/>
                                <figcaption aria-hidden="true">PILOT · ID 0x7A</figcaption>
                                <span className={style.open3dMark} aria-hidden="true">▶ 3D</span>
                            </figure>
                            <div className={style.aboutCopy}>
                                <p {...item(2)}>{t(about.paragraphKeys[0])}</p>
                                <p {...item(3)}>{t(about.paragraphKeys[1])}</p>
                            </div>
                        </div>
                        <dl className={style.statGrid}>
                            {about.stats.map((stat, i) => (
                                <div
                                    key={stat.labelKey}
                                    className={`${style.stat} ${style.item} ${style.open3d}`}
                                    style={{"--i": i + 4} as React.CSSProperties}
                                    {...clickable(() => openShowcase({kind: "about", id: stat.id}), `${stat.value} ${t(stat.labelKey)} — ${t("projects.open3d")}`)}
                                >
                                    <dt className={style.statValue}><CountUp value={stat.value} run={active === 1}/></dt>
                                    <dd className={style.statLabel}>{t(stat.labelKey)}</dd>
                                    <span className={style.open3dMark} aria-hidden="true">▶ 3D</span>
                                </div>
                            ))}
                        </dl>
                    </Panel>

                    {/* 02 — stack */}
                    <Panel ref={setPanelRef(2)} index={2} title={t("stack.title")} active={active === 2}>
                        <SectionTitle index={2} title={t("stack.title")}/>
                        <p className={`${style.subtitle} ${style.item}`} style={{"--i": 1} as React.CSSProperties}>{t("stack.subtitle")}</p>
                        <div className={style.tileGrid}>
                            {stack.map((cat, i) => (
                                <div
                                    key={cat.titleKey}
                                    className={`${style.tile} ${style.tileProject} ${style.item}`}
                                    style={{"--i": i + 2} as React.CSSProperties}
                                    data-stack={cat.id}
                                    {...clickable(() => openShowcase({kind: "stack", index: i}), `${t(cat.titleKey)} — ${t("projects.open3d")}`)}
                                >
                                    <div className={style.tileHeader}>
                                        <h3 className={style.tileTitle}>{t(cat.titleKey)} <span className={style.open3dInline} aria-hidden="true">▶ 3D</span></h3>
                                        <span className={`${style.badge} ${cat.level === "expert" ? style.badgeExpert : style.badgeStrong}`}>
                                            {t(cat.level === "expert" ? "stack.level.expert" : "stack.level.strong")}
                                        </span>
                                    </div>
                                    <ul className={style.tagWrap}>
                                        {cat.tags.map((tag) => <li key={tag} className={style.tag}>{tag}</li>)}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </Panel>

                    {/* 03 — projekty (klik = 3D hologram) */}
                    <Panel ref={setPanelRef(3)} index={3} title={t("projects.title")} active={active === 3}>
                        <SectionTitle index={3} title={t("projects.title")}/>
                        <p className={`${style.subtitle} ${style.item}`} style={{"--i": 1} as React.CSSProperties}>{t("projects.subtitle")}</p>
                        <div className={style.tileGrid}>
                            {projects.map((p, i) => (
                                <article
                                    key={p.title}
                                    className={`${style.tile} ${style.tileProject} ${style.item}`}
                                    style={{"--i": i + 2} as React.CSSProperties}
                                    data-project-kind={p.kind}
                                    onClick={() => openProject(i)}
                                >
                                    <div className={style.tileHeader}>
                                        <h3 className={style.tileTitle}>{p.title}</h3>
                                        <span className={`${style.badge} ${projectKindClass[p.kind]}`}>{t(`projects.kind.${p.kind}`)}</span>
                                    </div>
                                    <p className={style.tileDesc}>{t(p.descKey)}</p>
                                    <ul className={style.tagWrap}>
                                        {p.tags.map((tag) => <li key={tag} className={style.tag}>{tag}</li>)}
                                    </ul>
                                    <div className={style.tileActions}>
                                        <button type="button" className={style.tile3d} onClick={(e) => { e.stopPropagation(); openProject(i); }}>
                                            ▶ {t("projects.open3d")}
                                        </button>
                                        {p.href && (
                                            <a className={style.tileLink} href={p.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                                {t("projects.visit")} <span aria-hidden="true">→</span>
                                            </a>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </Panel>

                    {/* 04 — zkušenosti */}
                    <Panel ref={setPanelRef(4)} index={4} title={t("experience.title")} active={active === 4}>
                        <SectionTitle index={4} title={t("experience.title")}/>
                        <ol className={style.timeline}>
                            {experience.map((entry, i) => (
                                <li
                                    key={entry.company}
                                    className={`${style.timelineRow} ${style.item} ${style.open3d}`}
                                    style={{"--i": i + 1} as React.CSSProperties}
                                    data-place={entry.placeId}
                                    {...clickable(() => openPlace(entry.placeId), `${entry.company} — ${t("place.open")}`)}
                                >
                                    <span className={style.open3dMark} aria-hidden="true">⌖ 3D</span>
                                    <div className={style.timelineLogo}>
                                        <img src={entry.company === "Worldee.com" ? worldeeLogo.src : quadientLogo.src} alt={entry.logoAlt} width={48} height={48} loading="lazy" decoding="async"/>
                                    </div>
                                    <div className={style.timelineBody}>
                                        <div className={style.timelineYear}>
                                            <time dateTime={`${entry.from}-01-01`}>{entry.from}</time>
                                            <span aria-hidden="true"> — </span>
                                            {entry.to ? (
                                                <time dateTime={`${entry.to}-12-31`}>{entry.to}</time>
                                            ) : (
                                                <span className={style.timelinePresent}>{t("common.present")}</span>
                                            )}
                                        </div>
                                        <h3 className={style.timelineTitle}>{entry.title}</h3>
                                        <div className={style.timelineCompany}>
                                            <span className={style.visuallyHidden}>Společnost: </span>
                                            {entry.company}
                                        </div>
                                        <p className={style.timelineDesc}>{t(entry.descKey)}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </Panel>

                    {/* 05 — vzdělání */}
                    <Panel ref={setPanelRef(5)} index={5} title={t("education.title")} active={active === 5}>
                        <SectionTitle index={5} title={t("education.title")}/>
                        <ol className={style.timeline}>
                            {education.map((entry, i) => (
                                <li
                                    key={entry.school}
                                    className={`${style.timelineRow} ${style.item} ${style.open3d}`}
                                    style={{"--i": i + 1} as React.CSSProperties}
                                    data-place={entry.placeId}
                                    {...clickable(() => openPlace(entry.placeId), `${entry.school} — ${t("place.open")}`)}
                                >
                                    <span className={style.open3dMark} aria-hidden="true">⌖ 3D</span>
                                    <div className={style.timelineLogo}>
                                        <img src={entry.school.includes("Palackého") ? upLogo.src : spseLogo.src} alt={entry.school} width={48} height={48} loading="lazy" decoding="async"/>
                                    </div>
                                    <div className={style.timelineBody}>
                                        <div className={style.timelineYear}>
                                            <time dateTime={`${entry.from}-01-01`}>{entry.from}</time>
                                            <span aria-hidden="true"> — </span>
                                            <time dateTime={`${entry.to}-12-31`}>{entry.to}</time>
                                        </div>
                                        <h3 className={style.timelineTitle}>{entry.title}</h3>
                                        <div className={style.timelineCompany}>
                                            <span className={style.visuallyHidden}>Škola: </span>
                                            {entry.school}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </Panel>

                    {/* 06 — kontakt */}
                    <Panel ref={setPanelRef(6)} index={6} title={t("contact.title")} active={active === 6}>
                        <SectionTitle index={6} title={t("contact.title")}/>
                        <p className={`${style.subtitle} ${style.item}`} style={{"--i": 1} as React.CSSProperties}>{t("contact.subtitle")}</p>
                        <div className={style.contactGrid}>
                            <div className={`${style.contactItem} ${style.item}`} style={{"--i": 2} as React.CSSProperties} data-contact="email">
                                <div className={style.contactLabel}>{t("contact.email.label")}</div>
                                {profile.emails.map((email) => (
                                    <a key={email} className={style.contactLink} href={`mailto:${email}`}>{email}</a>
                                ))}
                            </div>
                            <div className={`${style.contactItem} ${style.item}`} style={{"--i": 3} as React.CSSProperties} data-contact="github">
                                <div className={style.contactLabel}>{t("contact.github.label")}</div>
                                <a className={style.contactLink} href={profile.github} target="_blank" rel="noreferrer">github.com/killov</a>
                            </div>
                            <div className={`${style.contactItem} ${style.item}`} style={{"--i": 4} as React.CSSProperties} data-contact="linkedin">
                                <div className={style.contactLabel}>{t("contact.linkedin.label")}</div>
                                <a className={style.contactLink} href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
                            </div>
                            <div className={`${style.contactItem} ${style.item}`} style={{"--i": 5} as React.CSSProperties} data-contact="location">
                                <div className={style.contactLabel}>{t("contact.location.label")}</div>
                                <div className={style.contactValue}>{t("contact.location.value")}</div>
                            </div>
                        </div>
                        <footer className={`${style.footer} ${style.item}`} style={{"--i": 6} as React.CSSProperties}>
                            <span>© Zdeněk Mazurák · {new Date().getFullYear()}</span>
                            <span className={style.footerMeta}>killov.github.io</span>
                        </footer>
                    </Panel>
                </div>
            </main>

            {showcase !== null && <ShowcaseCard view={resolveShowcase(showcase, t)} onClose={closeProject}/>}
            <FsdOverlay fsd={fsd} t={t}/>
            {city && (
                <CityHud
                    refs={cityRefs}
                    place={city.place}
                    driving={city.driving}
                    loading={city.loading}
                    toast={cityToast}
                    command={cityCommand}
                    onExit={exitPlace}
                    onPlace={cityPlace}
                />
            )}
            {game && <GameHud refs={gameRefs} command={gameCommand} onExit={exitGame} toast={toast}/>}


            <div className={style.telemetry} aria-hidden="true">
                <div><span className={style.telKey}>{t("hud.sector")}</span> {pad2(active)}/{pad2(LAST)} · {t(NAV_KEYS[STATIONS[active].id]).toUpperCase()}</div>
                <div><span className={style.telKey}>{t("hud.alt")}</span> <span ref={altRef}>—</span></div>
                <div><span className={style.telKey}>LAT/LON</span> <span ref={coordRef}>—</span></div>
                <div><span className={style.telKey}>{t("hud.vel")}</span> <span ref={velRef}>—</span></div>
            </div>

            <button
                type="button"
                className={style.dial}
                onClick={() => goTo(active === LAST ? 0 : active + 1)}
                aria-label={active === LAST ? t("nav.hero") : `${t("hud.next")}: ${t(NAV_KEYS[nextId])}`}
            >
                <svg viewBox="0 0 64 64" aria-hidden="true">
                    <circle cx="32" cy="32" r="26" className={style.dialTrack}/>
                    <circle ref={dialRef} cx="32" cy="32" r="26" className={style.dialArc}/>
                </svg>
                <span ref={pctRef} className={style.dialPct}>0%</span>
                <span className={style.dialNext}>
                    {active === LAST ? t("hud.end") : <>{t("hud.next")} ▸ {t(NAV_KEYS[nextId])}</>}
                </span>
            </button>

            <div ref={hintRef} className={style.hint} aria-hidden="true">
                <span>{t("hud.scroll")}</span>
                <span className={style.hintSub}>⟲ {t("hud.drag")}</span>
                <span className={style.hintChevrons}><i/><i/><i/></span>
            </div>

            <BootSequence/>

            {/* tohle se ve skutečnosti scrolluje — výška = délka letu */}
            <div className={style.spacer} style={{height: `calc(100vh + ${LAST * VH_PER_STATION}vh + ${readExtra}px)`}} aria-hidden="true"/>
            <MachineReadableProfile/>
        </div>
    );
}

function App({lang}: {lang: Lang}) {
    return (
        <LanguageProvider initialLang={lang}>
            <Experience/>
        </LanguageProvider>
    );
}

export default App
