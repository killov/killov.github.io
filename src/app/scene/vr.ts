import * as THREE from "three";
import {DEG, PLANETS, bodyMaterial, days, glowTexture, sunMaterial} from "./solar";

/**
 * VR režim (WebXR): stojíš uprostřed sluneční soustavy — planety obíhají
 * kolem tebe na skutečných pozicích podle data (čas jde zrychleně), Slunce
 * září pod holografickou podlahou a v kruhu kolem tebe visí panely s CV.
 *
 * Ovladače (i ruce): paprsek + spoušť. Spoušť na panelu ho přitáhne blíž,
 * na konzoli pod úvodním panelem se ovládá čas a odchod z VR.
 * Páčka doleva/doprava = otočení o 30°, nahoru/dolů = rychlost času.
 *
 * Běží úplně mimo Universe: vlastní renderer, scéna i smyčka. Bez headsetu
 * jde spustit náhled (`preview`) — obyčejná kamera, myš místo ovladače.
 */

export interface VrPanel {
    title: string;
    /** řádky panelu; prázdný řetězec = mezera */
    blocks: VrBlock[];
}

export type VrBlock =
    | {kind: "lead"; text: string}
    | {kind: "text"; text: string}
    | {kind: "head"; text: string; meta?: string}
    | {kind: "tags"; tags: string[]}
    | {kind: "stats"; items: Array<{value: string; label: string}>}
    | {kind: "gap"};

export interface VrOptions {
    panels: VrPanel[];
    /** lokalizované popisky (planety, konzole) */
    text: (key: string) => string;
    locale: string;
    onEnd: () => void;
    /** náhled bez headsetu (vývoj, test) */
    preview?: boolean;
}

type Hit =
    | {kind: "panel"; index: number}
    | {kind: "button"; id: ButtonId};

type ButtonId = "slower" | "pause" | "faster" | "exit";

const PANEL_R = 2.3;
const PANEL_NEAR = 1.35;
const PANEL_Y = 1.5;
const PANEL_W = 1.5;
const PX_PER_M = 1000;
const ECLIPTIC_Y = 1.15;
const SUN_POS = new THREE.Vector3(0, -8, 0);
const EARTH_RATE = 0.9856;
const MOON_RATE = 13.176396;
/** simulační sekundy za sekundu: 1 h/s … 1 měsíc/s */
const SPEEDS = [0, 3600, 86400, 7 * 86400, 30 * 86400];
const SPEED_KEYS = ["vr.speed.pause", "vr.speed.h", "vr.speed.d", "vr.speed.w", "vr.speed.m"];

const COLORS = {
    bg: "rgba(3, 12, 28, 0.86)",
    border: "#38d6ff",
    title: "#8fe6ff",
    text: "#d7e6ff",
    dim: "#8aa4c8",
    mint: "#6ef2c0",
    amber: "#ffc98a",
};
const SANS = "'Inter', 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** vzdálenost dráhy od tebe v metrech (vnitřní planety venku za panely) */
const orbitR = (a: number) => 3.6 + 4.2 * Math.pow(a, 0.8);
/** poloměry těles v metrech — ne v měřítku, ať je všechno vidět */
const BODY_R: Record<string, number> = {mercury: 0.22, venus: 0.4, mars: 0.32, jupiter: 1.5, saturn: 1.2};
const EARTH_R = 0.45;
const MOON_R = 0.13;
const MOON_DIST = 1.0;

function earthMaterial(sun: THREE.Vector3): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {uMap: {value: null}, uHas: {value: 0}, uSunPos: {value: sun}},
        vertexShader: /* glsl */ `
            varying vec3 vLocal;
            varying vec3 vWorld;
            varying vec3 vNormal;
            void main() {
                vLocal = position;
                vec4 w = modelMatrix * vec4(position, 1.0);
                vWorld = w.xyz;
                vNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * viewMatrix * w;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform sampler2D uMap;
            uniform float uHas;
            uniform vec3 uSunPos;
            varying vec3 vLocal;
            varying vec3 vWorld;
            varying vec3 vNormal;
            void main() {
                vec3 p = normalize(vLocal);
                float lat = asin(clamp(p.y, -1.0, 1.0));
                float lon = atan(-p.z, p.x);
                vec3 tex = texture2D(uMap, vec2(lon / 6.28318 + 0.5, lat / 3.14159 + 0.5)).rgb;
                // stejná textura jako hlavní Země: R = vzdálenost od pobřeží, G = Česko
                float land = smoothstep(0.49, 0.51, tex.r) * uHas;
                float cz = smoothstep(0.48, 0.52, tex.g) * uHas;
                vec3 col = mix(vec3(0.03, 0.12, 0.32), vec3(0.12, 0.4, 0.3), land);
                col = mix(col, vec3(0.43, 0.95, 0.75), cz * 0.8);
                vec3 n = normalize(vNormal);
                float diff = smoothstep(-0.1, 0.4, dot(n, normalize(uSunPos - vWorld)));
                col *= 0.15 + 0.95 * diff;
                float fres = pow(1.0 - max(dot(n, normalize(cameraPosition - vWorld)), 0.0), 2.5);
                col += vec3(0.22, 0.6, 1.0) * fres * 0.7;
                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });
}

/** štítek tělesa: plocha v metrech, natáčí se ke kameře */
function label(text: string, color: string, height: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = `600 44px ${MONO}`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    canvas.width = w;
    canvas.height = 68;
    ctx.font = font;
    ctx.fillStyle = "rgba(2, 10, 24, 0.65)";
    ctx.fillRect(0, 0, w, 68);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, 36);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
    sprite.scale.set((height * w) / 68, height, 1);
    sprite.center.set(0.5, 0);
    return sprite;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > width) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines;
}

/**
 * Vykreslí panel CV do canvasu. Nejdřív se jen měří (draw = false), aby
 * canvas měl přesně potřebnou výšku.
 */
function paintPanel(panel: VrPanel, index: number, hover: boolean, canvas?: HTMLCanvasElement): HTMLCanvasElement {
    const W = PANEL_W * PX_PER_M;
    const pad = 64;
    const inner = W - pad * 2;
    const c = canvas ?? document.createElement("canvas");
    const ctx = c.getContext("2d")!;

    const layout = (draw: boolean) => {
        let y = pad;
        const font = (f: string, color: string) => {
            ctx.font = f;
            ctx.fillStyle = color;
        };
        font(`600 24px ${MONO}`, COLORS.dim);
        if (draw) ctx.fillText(`${String(index).padStart(2, "0")} //`, pad, y + 20);
        y += 44;
        font(`700 64px ${SANS}`, COLORS.title);
        for (const line of wrap(ctx, panel.title, inner)) {
            if (draw) ctx.fillText(line, pad, y + 54);
            y += 76;
        }
        y += 18;
        if (draw) {
            ctx.fillStyle = COLORS.border;
            ctx.fillRect(pad, y, 120, 4);
        }
        y += 36;
        for (const b of panel.blocks) {
            if (b.kind === "gap") {
                y += 22;
            } else if (b.kind === "lead" || b.kind === "text") {
                const lead = b.kind === "lead";
                font(lead ? `500 38px ${SANS}` : `400 31px ${SANS}`, lead ? COLORS.text : COLORS.dim);
                const lh = lead ? 52 : 44;
                for (const line of wrap(ctx, b.text, inner)) {
                    if (draw) ctx.fillText(line, pad, y + lh * 0.75);
                    y += lh;
                }
                y += 14;
            } else if (b.kind === "head") {
                font(`700 36px ${SANS}`, COLORS.text);
                if (draw) ctx.fillText(b.text, pad, y + 36);
                if (b.meta) {
                    font(`500 26px ${MONO}`, COLORS.mint);
                    const mw = ctx.measureText(b.meta).width;
                    if (draw) ctx.fillText(b.meta, W - pad - mw, y + 34);
                }
                y += 52;
            } else if (b.kind === "tags") {
                font(`500 26px ${MONO}`, COLORS.title);
                let x = pad;
                const h = 42;
                for (const tag of b.tags) {
                    const tw = ctx.measureText(tag).width + 28;
                    if (x + tw > W - pad) {
                        x = pad;
                        y += h + 10;
                    }
                    if (draw) {
                        ctx.strokeStyle = "rgba(56, 214, 255, 0.55)";
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x, y, tw, h);
                        ctx.fillStyle = "rgba(56, 214, 255, 0.08)";
                        ctx.fillRect(x, y, tw, h);
                        ctx.fillStyle = COLORS.title;
                        ctx.fillText(tag, x + 14, y + 30);
                    }
                    x += tw + 10;
                }
                y += h + 22;
            } else if (b.kind === "stats") {
                const cw = inner / b.items.length;
                b.items.forEach((s, i) => {
                    const x = pad + i * cw;
                    font(`700 64px ${SANS}`, COLORS.mint);
                    if (draw) ctx.fillText(s.value, x, y + 60);
                    font(`400 24px ${SANS}`, COLORS.dim);
                    wrap(ctx, s.label, cw - 20).forEach((line, li) => {
                        if (draw) ctx.fillText(line, x, y + 104 + li * 32);
                    });
                });
                y += 180;
            }
        }
        return y + pad - 14;
    };

    // měření: font na canvasu nastavený, ale nic se nekreslí
    c.width = W;
    c.height = 8;
    const H = Math.ceil(layout(false));
    c.width = W;
    c.height = H;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(56, 214, 255, 0.1)");
    g.addColorStop(1, "rgba(47, 107, 255, 0.02)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = hover ? COLORS.mint : "rgba(56, 214, 255, 0.7)";
    ctx.lineWidth = hover ? 8 : 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    // rohové značky jako na webu
    ctx.fillStyle = hover ? COLORS.mint : COLORS.border;
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
        ctx.fillRect(x - (sx < 0 ? 46 : 0), y - (sy < 0 ? 10 : 0), 46, 10);
        ctx.fillRect(x - (sx < 0 ? 10 : 0), y - (sy < 0 ? 46 : 0), 10, 46);
    }
    ctx.textBaseline = "alphabetic";
    layout(true);
    return c;
}

function paintButton(canvas: HTMLCanvasElement, text: string, hover: boolean, accent: string) {
    canvas.width = 360;
    canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = hover ? "rgba(110, 242, 192, 0.28)" : "rgba(3, 12, 28, 0.88)";
    ctx.fillRect(0, 0, 360, 120);
    ctx.strokeStyle = hover ? COLORS.mint : accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 354, 114);
    ctx.font = `600 40px ${MONO}`;
    ctx.fillStyle = hover ? COLORS.mint : accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 180, 62);
}

interface PanelObj {
    mesh: THREE.Mesh;
    canvas: HTMLCanvasElement;
    tex: THREE.CanvasTexture;
    angle: number;
    dist: number;
    near: boolean;
    hover: boolean;
}

interface ButtonObj {
    id: ButtonId;
    mesh: THREE.Mesh;
    canvas: HTMLCanvasElement;
    tex: THREE.CanvasTexture;
    hover: boolean;
    text: string;
}

interface Pointer {
    source: THREE.Object3D;
    ray: THREE.Line;
    dot: THREE.Mesh;
    hit: Hit | null;
}

export class VrWorld {
    private renderer: THREE.WebGLRenderer;
    private canvas: HTMLCanvasElement;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
    /** hráč: kamera + ovladače; otočení páčkou točí celým rigem */
    private rig = new THREE.Group();
    private session: XRSession | null = null;
    private opts: VrOptions;

    private panels: PanelObj[] = [];
    private buttons: ButtonObj[] = [];
    private console: {mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture};
    private pointers: Pointer[] = [];
    private raycaster = new THREE.Raycaster();

    private sunMat = sunMaterial();
    private planets: Array<{L0: number; rate: number; r: number; mesh: THREE.Mesh}> = [];
    private earth: THREE.Group;
    private moon: THREE.Mesh;
    private earthMat: THREE.ShaderMaterial;
    private stars: THREE.Points;

    private disposed = false;
    private simTime = Date.now();
    private speedIndex = 2;
    private lastSpeed = 2;
    private clock = new THREE.Clock();
    private elapsed = 0;
    private consoleText = "";
    private turnReady = new Map<XRInputSource, boolean>();
    private speedReady = new Map<XRInputSource, boolean>();

    // náhled bez headsetu: myš = ovladač, tah = rozhlížení
    private mouse = new THREE.Vector2(9, 9);
    private look = {yaw: 0, pitch: -0.05, drag: null as {x: number; y: number; moved: number} | null};
    private mouseSource = new THREE.Object3D();

    constructor(opts: VrOptions) {
        this.opts = opts;
        this.canvas = document.createElement("canvas");
        this.canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:60;display:block;background:#000";
        if (!opts.preview) this.canvas.style.visibility = "hidden";
        document.body.appendChild(this.canvas);
        this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias: true});
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.renderer.xr.enabled = !opts.preview;
        this.renderer.xr.setFoveation(0.5);

        this.scene.background = new THREE.Color(0x01030a);
        this.rig.add(this.camera);
        this.scene.add(this.rig);

        this.stars = this.buildStars();
        this.scene.add(this.stars);
        this.buildFloor();
        const sys = this.buildSolar();
        this.earth = sys.earth;
        this.moon = sys.moon;
        this.earthMat = sys.earthMat;
        this.buildPanels();
        this.console = this.buildConsole();
        this.buildPointers();
        this.updateBodies();

        if (opts.preview) {
            this.camera.position.set(0, 1.6, 0);
            this.canvas.addEventListener("pointerdown", this.onMouseDown);
            window.addEventListener("pointermove", this.onMouseMove);
            window.addEventListener("pointerup", this.onMouseUp);
            window.addEventListener("keydown", this.onKey);
            window.addEventListener("resize", this.onResize);
            this.onResize();
        }
        this.renderer.setAnimationLoop(this.tick);
    }

    /** vstup do headsetu — volat přímo z kliknutí (prohlížeč chce uživatelské gesto) */
    async enter() {
        if (this.opts.preview) return;
        const xr = navigator.xr;
        if (!xr) throw new Error("WebXR není k dispozici");
        const session = await xr.requestSession("immersive-vr", {optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"]});
        this.session = session;
        session.addEventListener("end", this.onSessionEnd);
        // bez podlahy (local) je hlava v počátku — rig zvedneme do výšky očí
        let floor = true;
        try {
            await session.requestReferenceSpace("local-floor");
        } catch {
            floor = false;
        }
        this.renderer.xr.setReferenceSpaceType(floor ? "local-floor" : "local");
        this.rig.position.y = floor ? 0 : 1.6;
        await this.renderer.xr.setSession(session);
    }

    exit() {
        if (this.session) this.session.end().catch(() => this.onSessionEnd());
        else this.onSessionEnd();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.renderer.setAnimationLoop(null);
        this.session?.removeEventListener("end", this.onSessionEnd);
        this.canvas.removeEventListener("pointerdown", this.onMouseDown);
        window.removeEventListener("pointermove", this.onMouseMove);
        window.removeEventListener("pointerup", this.onMouseUp);
        window.removeEventListener("keydown", this.onKey);
        window.removeEventListener("resize", this.onResize);
        this.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            mesh.geometry?.dispose();
            const mat = mesh.material as (THREE.Material & {map?: THREE.Texture | null}) | undefined;
            if (mat && !Array.isArray(mat)) {
                mat.map?.dispose();
                mat.dispose();
            }
        });
        (this.earthMat.uniforms.uMap.value as THREE.Texture | null)?.dispose();
        this.renderer.dispose();
        this.canvas.remove();
    }

    private onSessionEnd = () => {
        this.session = null;
        this.dispose();
        this.opts.onEnd();
    };

    // --- stavba scény ---

    private buildStars(): THREE.Points {
        const count = 4000;
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < count; i++) {
            const u = Math.random() * 2 - 1;
            const th = Math.random() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            const r = 600 + Math.random() * 300;
            pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
            c.setHSL(0.58 + (Math.random() - 0.5) * 0.12, 0.6, 0.6 + Math.random() * 0.4);
            col.set([c.r, c.g, c.b], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false}));
        pts.frustumCulled = false;
        return pts;
    }

    /** průhledná holografická podlaha — pod ní je vidět Slunce */
    private buildFloor() {
        const grid = new THREE.PolarGridHelper(3.2, 16, 8, 96, 0x38d6ff, 0x1d4f8a);
        const mat = grid.material as THREE.LineBasicMaterial;
        mat.transparent = true;
        mat.opacity = 0.32;
        mat.depthWrite = false;
        grid.position.y = 0.002;
        this.scene.add(grid);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 96), new THREE.MeshBasicMaterial({
            color: 0x0b2a4a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
        }));
        disc.rotation.x = -Math.PI / 2;
        this.scene.add(disc);
        const rim = new THREE.Mesh(new THREE.RingGeometry(3.18, 3.24, 128), new THREE.MeshBasicMaterial({
            color: 0x38d6ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = 0.004;
        this.scene.add(rim);
    }

    private buildSolar() {
        const t = this.opts.text;
        const sun = new THREE.Mesh(new THREE.SphereGeometry(2.6, 64, 48), this.sunMat);
        sun.position.copy(SUN_POS);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture("rgba(255,220,150,1)", "rgba(255,140,40,0.45)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        glow.scale.setScalar(20);
        sun.add(glow);
        const sunLabel = label(t("game.body.sun"), "#ffc76e", 0.5);
        sunLabel.position.y = 3;
        sun.add(sunLabel);
        this.scene.add(sun);

        const orbitMat = new THREE.LineBasicMaterial({color: 0x58a6ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false});
        const orbit = (r: number) => {
            const pts = new THREE.EllipseCurve(0, 0, r, r).getPoints(256).map((p) => new THREE.Vector3(p.x, ECLIPTIC_Y, p.y));
            this.scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat));
        };

        for (const def of PLANETS) {
            const radius = BODY_R[def.id];
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), bodyMaterial(def.color, def.color2, def.bands, SUN_POS));
            if (def.id === "saturn") {
                const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.3, radius * 2.25, 96), new THREE.MeshBasicMaterial({
                    color: 0xd9c08f, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
                }));
                ring.rotation.x = Math.PI / 2 - 0.47;
                mesh.add(ring);
            }
            const l = label(t(`game.body.${def.id}`), "#9fd0ff", 0.16 + radius * 0.12);
            l.position.y = radius + 0.08;
            mesh.add(l);
            this.scene.add(mesh);
            const r = orbitR(def.a);
            orbit(r);
            this.planets.push({L0: def.L0, rate: def.rate, r, mesh});
        }

        // Země (hologram jako na webu) + Měsíc
        const earth = new THREE.Group();
        const earthMat = earthMaterial(SUN_POS);
        const globe = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 48), earthMat);
        globe.rotation.z = 23.4 * DEG;
        earth.add(globe);
        const atm = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.12, 48, 32), new THREE.MeshBasicMaterial({
            color: 0x3a8cff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
        }));
        earth.add(atm);
        const el = label(t("game.body.earth"), "#6ef2c0", 0.2);
        el.position.y = EARTH_R + 0.1;
        earth.add(el);
        this.scene.add(earth);
        orbit(orbitR(1));
        new THREE.TextureLoader().load("/textures/earth-1024.webp", (tex) => {
            if (this.disposed) return tex.dispose();
            tex.colorSpace = THREE.NoColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            earthMat.uniforms.uMap.value = tex;
            earthMat.uniforms.uHas.value = 1;
        });

        const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 32, 24), bodyMaterial(0xd8d8d8, 0x6c6c72, 0, SUN_POS));
        const ml = label(t("game.body.moon"), "#d7e6ff", 0.12);
        ml.position.y = MOON_R + 0.05;
        moon.add(ml);
        this.scene.add(moon);
        return {earth, moon, earthMat};
    }

    private buildPanels() {
        const n = this.opts.panels.length;
        this.opts.panels.forEach((panel, i) => {
            const canvas = paintPanel(panel, i, false);
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 8;
            const h = canvas.height / PX_PER_M;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, h), new THREE.MeshBasicMaterial({map: tex, transparent: true, side: THREE.DoubleSide}));
            const hit: Hit = {kind: "panel", index: i};
            mesh.userData.hit = hit;
            this.scene.add(mesh);
            this.panels.push({mesh, canvas, tex, angle: (i / n) * Math.PI * 2, dist: PANEL_R, near: false, hover: false});
        });
        this.placePanels(1);
    }

    /** panely v kruhu kolem tebe; přitažený panel přijede blíž */
    private placePanels(k: number) {
        for (const p of this.panels) {
            const goal = p.near ? PANEL_NEAR : PANEL_R;
            p.dist += (goal - p.dist) * k;
            const h = (p.mesh.geometry as THREE.PlaneGeometry).parameters.height;
            // vysoký panel nesmí zajet do podlahy
            const y = Math.max(PANEL_Y, h / 2 + 0.35);
            p.mesh.position.set(Math.sin(p.angle) * p.dist, y, -Math.cos(p.angle) * p.dist);
            p.mesh.rotation.set(0, -p.angle, 0);
        }
    }

    /** konzole pod úvodním panelem: datum, rychlost času, tlačítka */
    private buildConsole() {
        const group = new THREE.Group();
        group.position.set(0, 0.95, -1.1);
        group.rotation.x = -0.55;
        this.scene.add(group);

        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 150;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.15), new THREE.MeshBasicMaterial({map: tex, transparent: true}));
        mesh.position.y = 0.12;
        group.add(mesh);

        const defs: Array<[ButtonId, string]> = [["slower", "◀◀"], ["pause", ""], ["faster", "▶▶"], ["exit", this.opts.text("vr.exit")]];
        defs.forEach(([id, text], i) => {
            const c = document.createElement("canvas");
            const t = new THREE.CanvasTexture(c);
            t.colorSpace = THREE.SRGBColorSpace;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.09), new THREE.MeshBasicMaterial({map: t, transparent: true}));
            m.position.set(-0.45 + i * 0.3, -0.02, 0);
            const hit: Hit = {kind: "button", id};
            m.userData.hit = hit;
            group.add(m);
            this.buttons.push({id, mesh: m, canvas: c, tex: t, hover: false, text});
        });
        this.paintButtons();
        return {mesh, canvas, tex};
    }

    private paintButtons() {
        for (const b of this.buttons) {
            const text = b.id === "pause" ? (this.speedIndex === 0 ? "▶" : "❚❚") : b.text;
            paintButton(b.canvas, text, b.hover, b.id === "exit" ? COLORS.amber : COLORS.title);
            b.tex.needsUpdate = true;
        }
    }

    private paintConsole() {
        const date = new Date(this.simTime).toLocaleString(this.opts.locale, {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"});
        const text = `${date}  ·  ${this.opts.text(SPEED_KEYS[this.speedIndex])}`;
        if (text === this.consoleText) return;
        this.consoleText = text;
        const {canvas, tex} = this.console;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(3, 12, 28, 0.8)";
        ctx.fillRect(0, 20, canvas.width, 110);
        ctx.font = `600 52px ${MONO}`;
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, 78);
        tex.needsUpdate = true;
    }

    private buildPointers() {
        const makePointer = (source: THREE.Object3D): Pointer => {
            const ray = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
                new THREE.LineBasicMaterial({color: 0x6ef2c0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false}),
            );
            ray.scale.z = 5;
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({color: 0x6ef2c0}));
            dot.visible = false;
            this.scene.add(dot);
            return {source, ray, dot, hit: null};
        };
        if (this.opts.preview) {
            this.pointers.push(makePointer(this.mouseSource));
            return;
        }
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            const p = makePointer(controller);
            controller.add(p.ray);
            controller.addEventListener("select", () => this.activate(p.hit));
            controller.addEventListener("connected", (e) => {
                // ruce bez paprsku (gaze) paprsek nepotřebují
                const source = (e as unknown as {data: XRInputSource}).data;
                p.ray.visible = source.targetRayMode === "tracked-pointer";
            });
            this.rig.add(controller);
            this.pointers.push(p);
        }
    }

    // --- interakce ---

    private activate(hit: Hit | null) {
        if (!hit) return;
        if (hit.kind === "panel") {
            const p = this.panels[hit.index];
            const near = !p.near;
            this.panels.forEach((o) => (o.near = false));
            p.near = near;
        } else if (hit.id === "exit") {
            this.exit();
        } else if (hit.id === "pause") {
            if (this.speedIndex === 0) {
                this.speedIndex = this.lastSpeed;
            } else {
                this.lastSpeed = this.speedIndex;
                this.speedIndex = 0;
            }
            this.paintButtons();
        } else {
            this.changeSpeed(hit.id === "faster" ? 1 : -1);
        }
    }

    private changeSpeed(dir: number) {
        this.speedIndex = THREE.MathUtils.clamp(this.speedIndex + dir, 0, SPEEDS.length - 1);
        if (this.speedIndex > 0) this.lastSpeed = this.speedIndex;
        this.paintButtons();
    }

    private pick(p: Pointer): {hit: Hit; point: THREE.Vector3; distance: number} | null {
        p.source.updateMatrixWorld();
        if (this.opts.preview) {
            if (Math.abs(this.mouse.x) > 1) return null;
            this.raycaster.setFromCamera(this.mouse, this.camera);
        } else {
            this.raycaster.setFromXRController(p.source as THREE.XRTargetRaySpace);
        }
        const targets = [...this.panels.map((o) => o.mesh), ...this.buttons.map((b) => b.mesh)];
        const hits = this.raycaster.intersectObjects(targets, false);
        if (!hits.length) return null;
        return {hit: hits[0].object.userData.hit as Hit, point: hits[0].point, distance: hits[0].distance};
    }

    private updatePointers() {
        const hovered = new Set<PanelObj | ButtonObj>();
        for (const p of this.pointers) {
            const res = this.pick(p);
            p.hit = res?.hit ?? null;
            p.dot.visible = !!res;
            if (res) {
                p.dot.position.copy(res.point);
                p.ray.scale.z = res.distance;
                if (res.hit.kind === "panel") hovered.add(this.panels[res.hit.index]);
                else {
                    const id = res.hit.id;
                    const b = this.buttons.find((o) => o.id === id);
                    if (b) hovered.add(b);
                }
            } else {
                p.ray.scale.z = 5;
            }
        }
        this.panels.forEach((o, i) => {
            const h = hovered.has(o);
            if (h === o.hover) return;
            o.hover = h;
            paintPanel(this.opts.panels[i], i, h, o.canvas);
            o.tex.needsUpdate = true;
        });
        let repaint = false;
        for (const b of this.buttons) {
            const h = hovered.has(b);
            if (h !== b.hover) {
                b.hover = h;
                repaint = true;
            }
        }
        if (repaint) this.paintButtons();
        if (this.opts.preview) this.canvas.style.cursor = hovered.size ? "pointer" : this.look.drag ? "grabbing" : "grab";
    }

    /** páčky: otočení o 30° (doleva/doprava), rychlost času (nahoru/dolů) */
    private updateGamepads() {
        const session = this.session;
        if (!session) return;
        for (let i = 0; i < session.inputSources.length; i++) {
            const source = session.inputSources[i];
            const axes = source.gamepad?.axes;
            if (!axes || axes.length < 4) continue;
            const x = axes[2];
            const y = axes[3];
            if (Math.abs(x) < 0.3) this.turnReady.set(source, true);
            else if (Math.abs(x) > 0.7 && this.turnReady.get(source) !== false) {
                this.turnReady.set(source, false);
                this.snapTurn(x > 0 ? -30 * DEG : 30 * DEG);
            }
            if (Math.abs(y) < 0.3) this.speedReady.set(source, true);
            else if (Math.abs(y) > 0.7 && this.speedReady.get(source) !== false) {
                this.speedReady.set(source, false);
                this.changeSpeed(y < 0 ? 1 : -1);
            }
        }
    }

    /** otočí rig kolem hlavy, ať se člověk neposune do strany */
    private snapTurn(angle: number) {
        const head = new THREE.Vector3();
        this.renderer.xr.getCamera().getWorldPosition(head);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        this.rig.position.sub(head).applyQuaternion(q).add(head);
        this.rig.quaternion.premultiply(q);
    }

    // --- náhled bez headsetu ---

    private onResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    };

    private onMouseDown = (e: PointerEvent) => {
        this.look.drag = {x: e.clientX, y: e.clientY, moved: 0};
    };

    private onMouseMove = (e: PointerEvent) => {
        this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const d = this.look.drag;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        d.moved += Math.abs(dx) + Math.abs(dy);
        this.look.yaw += dx * 0.004;
        this.look.pitch = THREE.MathUtils.clamp(this.look.pitch + dy * 0.004, -1.4, 1.4);
    };

    private onMouseUp = () => {
        const d = this.look.drag;
        this.look.drag = null;
        if (d && d.moved < 6) this.activate(this.pointers[0]?.hit ?? null);
    };

    private onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") this.exit();
    };

    // --- smyčka ---

    private updateBodies() {
        const d = days(this.simTime);
        for (const p of this.planets) {
            const L = (p.L0 + p.rate * d) * DEG;
            p.mesh.position.set(Math.cos(L) * p.r, ECLIPTIC_Y, -Math.sin(L) * p.r);
            p.mesh.rotation.y = this.elapsed * 0.2;
        }
        const L = (100.46 + EARTH_RATE * d) * DEG;
        const r = orbitR(1);
        this.earth.position.set(Math.cos(L) * r, ECLIPTIC_Y, -Math.sin(L) * r);
        // Země se otočí jednou za den simulace
        this.earth.children[0].rotation.y = ((this.simTime / 86400000) % 1) * Math.PI * 2;
        const ml = (218.316 + MOON_RATE * d) * DEG;
        this.moon.position.set(Math.cos(ml) * MOON_DIST, 0, -Math.sin(ml) * MOON_DIST).add(this.earth.position);
    }

    private tick = () => {
        const dt = Math.min(this.clock.getDelta(), 0.1);
        this.elapsed += dt;
        this.simTime += dt * SPEEDS[this.speedIndex] * 1000;
        this.sunMat.uniforms.uTime.value = this.elapsed;
        this.updateBodies();
        this.updateGamepads();
        this.placePanels(1 - Math.exp(-dt * 6));
        if (this.opts.preview) {
            this.camera.rotation.set(-this.look.pitch, -this.look.yaw, 0, "YXZ");
        }
        this.updatePointers();
        this.paintConsole();
        this.renderer.render(this.scene, this.camera);
    };
}
