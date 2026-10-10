import * as THREE from "three";
import {STATIONS} from "./stations";
import {buildShowcase, Showcase} from "./showcase";
import {GameFocus, GameHud, GameTarget, SpaceGame} from "./solar";
import type {City, CityHud} from "./city";

/**
 * Celá 3D scéna: holografická Země (skutečné kontinenty z Natural Earth,
 * zvýrazněné Česko), atmosféra, drátěný obal, orbitální prstence, satelity
 * (= projekty), hvězdy a "warp" čáry při rychlém letu. Kamera letí po křivce
 * mezi zastávkami ze stations.ts podle scroll progressu; Země se na každé
 * zastávce natočí tak, aby značka Olomouce padla na `markerNdc`.
 *
 * Panely webu "visí" ve 3D prostoru: počítáme jim CSS matrix3d stejně jako
 * three.js CSS3DRenderer (DOM ale zůstává pod Reactem, jen dostává transform).
 *
 * Běží mimo React: jedna rAF smyčka, která scénu vykreslí a přes `onFrame`
 * předá stav DOM vrstvě — žádné re-rendery za snímek.
 */

export const HOME = {lat: 49.5938, lon: 17.2509, name: "OLOMOUC · CZ"};

export interface PanelLayout {
    /** střed panelu na obrazovce při příletu na zastávku (-1..1) */
    ndcX: number;
    ndcY: number;
    /** natočení kolem svislé osy (rad) — panely se "stáčí" ke středu */
    yaw: number;
}

export interface FrameState {
    /** vyhlazená pozice 0..N-1 */
    progress: number;
    velocity: number;
    /** značka Olomouce v px, null = mimo obrazovku / odvrácená */
    marker: {x: number; y: number} | null;
    altitude: number;
    lat: number;
    lon: number;
    css: {
        perspective: number;
        camera: string;
        panels: Array<{transform: string; depth: number}>;
    };
    /** stav herního režimu (jen když běží) */
    game: GameHud | null;
    /** stav 3D města (jen když je otevřené); loading = ještě se stahuje / letí se dolů */
    city: (CityHud & {loading: boolean}) | null;
}

export type CityCommand =
    | {type: "drive"; value: boolean}
    | {type: "focus"; value: string}
    | {type: "target"; value: string | null}
    | {type: "touch"; throttle: number; steer: number};

export type GameCommand =
    | {type: "speed"; value: number}
    | {type: "time"; value: number}
    | {type: "focus"; value: GameFocus}
    | {type: "rocket"}
    | {type: "demoThrow"};

export interface UniverseOptions {
    reducedMotion: boolean;
    projectTitles: string[];
    onFrame: (state: FrameState) => void;
    onSatellite: (index: number) => void;
    /** názvy těles pro herní režim (lokalizované) */
    bodyNames: () => Record<GameTarget | "earth", string>;
}

const R = 10;

const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
/** 1 na čáře v každém celém čísle v, šířka ~ width px */
float gridLine(float v, float width) {
    float d = abs(fract(v - 0.5) - 0.5);
    // kde je pole saturované, je fwidth 0 → smoothstep(0, 0) by byl nedefinovaný
    float w = fwidth(v) * width;
    return w < 1e-5 ? 0.0 : 1.0 - smoothstep(0.0, w, d);
}
`;

/** zeměpisné souřadnice → bod na jednotkové kouli (stejná konvence jako v shaderu) */
export function latLonToVec(lat: number, lon: number, radius = 1): THREE.Vector3 {
    const phi = THREE.MathUtils.degToRad(lat);
    const lam = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(
        radius * Math.cos(phi) * Math.cos(lam),
        radius * Math.sin(phi),
        -radius * Math.cos(phi) * Math.sin(lam),
    );
}

function planetMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: {value: 0},
            uMap: {value: null},
            uMapMix: {value: 0},
            uSun: {value: new THREE.Vector3(0.6, 0.35, 0.7).normalize()},
            uSharp: {value: 0},
        },
        vertexShader: /* glsl */ `
            varying vec3 vPos;
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                vPos = position;
                vec4 world = modelMatrix * vec4(position, 1.0);
                vNormal = normalize(mat3(modelMatrix) * normal);
                vView = normalize(cameraPosition - world.xyz);
                gl_Position = projectionMatrix * viewMatrix * world;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform sampler2D uMap;
            uniform float uMapMix;
            uniform vec3 uSun;
            uniform float uSharp;
            varying vec3 vPos;
            varying vec3 vNormal;
            varying vec3 vView;
            ${NOISE_GLSL}
            void main() {
                vec3 p = normalize(vPos);
                float lat = asin(clamp(p.y, -1.0, 1.0));
                float lon = atan(-p.z, p.x);
                vec2 uv = vec2(lon / 6.28318 + 0.5, lat / 3.14159 + 0.5);
                vec3 tex = texture2D(uMap, uv).rgb;

                // R = vzdálenost od pobřeží v px (+ pevnina), G = Česko, B = hranice států
                float sd = (tex.r - 0.5) * 96.0;
                float land = smoothstep(-0.6, 0.6, sd) * uMapMix;
                float coast = (1.0 - smoothstep(0.0, max(fwidth(sd) * 1.4, 1e-3), abs(sd))) * uMapMix;
                float contour = gridLine(sd / 7.0, 1.0) * step(1.5, sd) * (1.0 - smoothstep(26.0, 44.0, sd)) * uMapMix;
                float sonar = gridLine(sd / 9.0, 0.9) * step(sd, -1.5) * smoothstep(-46.0, -6.0, sd) * uMapMix;
                float borders = tex.b * land * 0.55;

                float csd = (tex.g - 0.5) * 32.0;
                float czIn = smoothstep(-0.4, 0.4, csd) * uMapMix;
                float czEdge = (1.0 - smoothstep(0.0, max(fwidth(csd) * 1.6, 1e-3), abs(csd))) * uMapMix;
                float pulse = 0.65 + 0.35 * sin(uTime * 2.4);

                float grid = max(gridLine(lat * 18.0 / 3.14159, 0.8), gridLine(lon * 18.0 / 3.14159, 0.8)) * 0.28;

                float city = smoothstep(0.62, 0.9, snoise(p * 70.0)) * land * (1.0 - czIn);

                float sunDot = dot(vNormal, uSun);
                // v herním režimu skutečný terminátor (den/noc podle času)
                float day = mix(clamp(sunDot * 0.9 + 0.25, 0.0, 1.0), smoothstep(-0.12, 0.2, sunDot), uSharp);
                vec3 ocean = vec3(0.01, 0.03, 0.08);
                vec3 ground = vec3(0.03, 0.12, 0.24);
                vec3 col = mix(ocean, ground, land) * (0.4 + day * 0.85);

                vec3 cyan = vec3(0.22, 0.84, 1.0);
                vec3 blue = vec3(0.18, 0.42, 1.0);
                vec3 mint = vec3(0.43, 0.95, 0.75);
                col += cyan * coast * 1.1;
                col += cyan * contour * 0.35;
                col += blue * sonar * 0.22;
                col += blue * borders;
                col += blue * grid * (0.45 + (1.0 - day) * 0.35);
                col += vec3(0.55, 0.85, 1.0) * city * (1.0 - day) * (1.3 + uSharp * 1.2);
                col *= mix(1.0, 0.35 + day * 0.75, uSharp * 0.8);
                // domov: Česko svítí a pulzuje
                col = mix(col, mint * (0.35 + 0.25 * pulse), czIn * 0.75);
                col += mint * czEdge * 1.6;

                float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.6);
                col += cyan * fres * 0.85;

                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });
}

function atmosphereMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vNormal = normalize(mat3(modelMatrix) * normal);
                vView = normalize(cameraPosition - world.xyz);
                gl_Position = projectionMatrix * viewMatrix * world;
            }
        `,
        fragmentShader: /* glsl */ `
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                float i = pow(clamp(0.72 + dot(vNormal, vView), 0.0, 1.0), 4.0);
                gl_FragColor = vec4(vec3(0.2, 0.6, 1.0) * i * 1.6, i);
            }
        `,
    });
}

/** tečkovaný prstenec, čárky obíhají (uSpeed) */
function ringMaterial(color: THREE.Color, dashes: number, speed: number, opacity: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: {value: 0},
            uColor: {value: color},
            uOpacity: {value: opacity},
            uBoost: {value: 0},
        },
        vertexShader: /* glsl */ `
            varying vec2 vPos;
            void main() {
                vPos = position.xy;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uBoost;
            varying vec2 vPos;
            void main() {
                float ang = atan(vPos.y, vPos.x) / 6.28318 + 0.5;
                float dash = step(0.45, fract(ang * ${dashes.toFixed(1)} + uTime * ${speed.toFixed(3)}));
                gl_FragColor = vec4(uColor, dash * (uOpacity + uBoost));
            }
        `,
    });
}

function starMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: {value: 0},
            uWarp: {value: 0},
            uPixelRatio: {value: 1},
            uScale: {value: 1},
        },
        vertexShader: /* glsl */ `
            attribute float aSize;
            attribute float aSeed;
            uniform float uTime;
            uniform float uWarp;
            uniform float uPixelRatio;
            uniform float uScale;
            varying float vAlpha;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mv;
                float twinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed * 1.8) + aSeed * 40.0);
                vAlpha = twinkle * (0.55 + uWarp * 0.8);
                gl_PointSize = aSize * uPixelRatio * (1.0 + uWarp * 1.6) * (300.0 * uScale / -mv.z);
            }
        `,
        fragmentShader: /* glsl */ `
            varying float vAlpha;
            void main() {
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.0, d);
                gl_FragColor = vec4(vec3(0.75, 0.88, 1.0), a * vAlpha);
            }
        `,
    });
}

function textSprite(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = "600 40px 'JetBrains Mono', ui-monospace, monospace";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    canvas.width = w;
    canvas.height = 64;
    ctx.font = font;
    ctx.fillStyle = "rgba(2, 10, 24, 0.7)";
    ctx.fillRect(0, 0, w, 64);
    ctx.fillStyle = "#38d6ff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, opacity: 0}));
    sprite.scale.set((0.9 * w) / 64, 0.9, 1);
    return sprite;
}

/** CSS matice jako v three.js CSS3DRenderer */
const eps = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);
function cssCameraMatrix(m: THREE.Matrix4): string {
    const e = m.elements;
    return `matrix3d(${eps(e[0])},${eps(-e[1])},${eps(e[2])},${eps(e[3])},${eps(e[4])},${eps(-e[5])},${eps(e[6])},${eps(e[7])},${eps(e[8])},${eps(-e[9])},${eps(e[10])},${eps(e[11])},${eps(e[12])},${eps(-e[13])},${eps(e[14])},${eps(e[15])})`;
}
function cssObjectMatrix(m: THREE.Matrix4): string {
    const e = m.elements;
    return `translate(-50%,-50%) matrix3d(${eps(e[0])},${eps(e[1])},${eps(e[2])},${eps(e[3])},${eps(-e[4])},${eps(-e[5])},${eps(-e[6])},${eps(-e[7])},${eps(e[8])},${eps(e[9])},${eps(e[10])},${eps(e[11])},${eps(e[12])},${eps(e[13])},${eps(e[14])},${eps(e[15])})`;
}

export class Universe {
    private renderer: THREE.WebGLRenderer | null = null;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 9000);
    private camCurve: THREE.CatmullRomCurve3 | null = null;
    private targetCurve: THREE.CatmullRomCurve3 | null = null;
    private upCurve: THREE.CatmullRomCurve3 | null = null;
    private stationCams: THREE.PerspectiveCamera[] = [];
    private stationQuats: THREE.Quaternion[] = [];

    /** Země se vším, co k ní patří (atmosféra, prstence, satelity) — v herním režimu letí */
    private earth = new THREE.Group();
    private globe = new THREE.Group();
    private stars: THREE.Points | null = null;
    private atmosphere: THREE.Mesh | null = null;

    // herní režim
    private game: SpaceGame | null = null;
    private gameMix = 0;
    private gameTarget = 0;

    // 3D město: ponor do Země → přechod → město
    private city: City | null = null;
    private cityLoad: Promise<void> | null = null;
    private cityState: "off" | "dive" | "in" = "off";
    private cityT = 0;
    private cityPlace = "";
    private cityLatLon = {lat: 0, lon: 0};
    private diveFrom = new THREE.Vector3();
    private diveUp = new THREE.Vector3();
    private flash = 0;
    private flashMat = new THREE.MeshBasicMaterial({color: 0x9fe6ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending});
    private flashScene = new THREE.Scene();
    private homeMarker = new THREE.Group();
    private homeLocal = latLonToVec(HOME.lat, HOME.lon);
    private planetMat: THREE.ShaderMaterial | null = null;
    private starMat: THREE.ShaderMaterial | null = null;
    private shell: THREE.LineSegments | null = null;
    private rings: THREE.Mesh[] = [];
    private ringMats: THREE.ShaderMaterial[] = [];
    private satellites: Array<{pivot: THREE.Object3D; body: THREE.Mesh; hit: THREE.Mesh; label: THREE.Sprite; speed: number}> = [];
    private orbitMats: THREE.LineBasicMaterial[] = [];
    private warp: THREE.LineSegments | null = null;
    private warpBase: Float32Array | null = null;

    // projektové hologramy (vlastní scéna kreslená přes ztmavenou Zemi)
    private scScene = new THREE.Scene();
    private scCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    private scPivot = new THREE.Group();
    private showcase: Showcase | null = null;
    private scMix = 0;
    private scTarget = 0;
    private scTime = 0;
    private dimScene = new THREE.Scene();
    private dimCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private dimMat = new THREE.MeshBasicMaterial({color: 0x01040a, transparent: true, opacity: 0, depthTest: false, depthWrite: false});

    private panelLayouts: PanelLayout[] = [];
    private panelMatrices: THREE.Matrix4[] = [];
    private panelPositions: THREE.Vector3[] = [];

    private target = 0;
    private progress = 0;
    private velocity = 0;
    private pointer = new THREE.Vector2();
    private pointerSmooth = new THREE.Vector2();
    private intro = 0;
    private frame = 0;
    private last = 0;
    private elapsed = 0;
    private width = 1;
    private height = 1;
    private portrait = false;
    private running = true;
    private activeStation = 0;

    // otáčení Země / hologramu tažením
    private drag: {id: number; x: number; y: number; moved: number} | null = null;
    /** prsty na displeji — dvěma se ve hře a ve městě zoomuje (pinch) */
    private touches = new Map<number, {x: number; y: number}>();
    private pinchDist = 0;
    private yaw = 0;
    private pitch = 0;
    private yawVel = 0;
    private pitchVel = 0;
    private scYaw = 0.6;
    private scPitch = 0.3;
    private raycaster = new THREE.Raycaster();
    private gameCam = new THREE.PerspectiveCamera();
    private defaultSun = new THREE.Vector3(0.6, 0.35, 0.7).normalize();

    private readonly opts: UniverseOptions;

    constructor(private canvas: HTMLCanvasElement, opts: UniverseOptions) {
        this.opts = opts;
        try {
            this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: "high-performance"});
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.autoClear = false;
        } catch {
            // bez WebGL zůstane jen DOM vrstva (panely + HUD) nad CSS pozadím
            this.renderer = null;
        }
        if (this.renderer) this.build();
        this.intro = opts.reducedMotion ? 1 : 0;
        this.resize();
        document.addEventListener("visibilitychange", this.onVisibility);
        canvas.addEventListener("pointerdown", this.onPointerDown);
        canvas.addEventListener("wheel", this.onWheel, {passive: false});
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointercancel", this.onPointerUp);
        this.last = performance.now();
        this.frame = requestAnimationFrame(this.tick);
    }

    setTarget(progress: number) {
        this.target = progress;
    }

    /** okamžitý skok (např. načtení s #hash) */
    jumpTo(progress: number) {
        this.target = progress;
        this.progress = progress;
    }

    setPointer(x: number, y: number) {
        this.pointer.set(x, y);
    }

    setPanelLayouts(layouts: PanelLayout[]) {
        this.panelLayouts = layouts;
        this.buildPanels();
    }

    openShowcase(id: string, labels: string[], image?: string) {
        this.disposeShowcase();
        this.showcase = buildShowcase(id, labels, image);
        this.scPivot.add(this.showcase.group);
        this.scTime = 0;
        this.scTarget = 1;
        this.scYaw = 0.6;
        this.scPitch = 0.3;
    }

    closeShowcase() {
        this.scTarget = 0;
    }

    enterGame() {
        if (!this.renderer) return;
        if (!this.game) {
            this.game = new SpaceGame({names: this.opts.bodyNames(), homeLocal: this.homeLocal});
            this.scene.add(this.game.group);
        }
        if (this.gameMix < 0.01) this.game.start();
        this.gameTarget = 1;
        this.yaw = this.pitch = this.yawVel = this.pitchVel = 0;
    }

    exitGame() {
        this.gameTarget = 0;
        this.canvas.style.cursor = "";
    }

    /** klik na školu / práci: přiblížení na Zemi a přechod do 3D města */
    enterPlace(id: string, lat: number, lon: number, placeNames: Record<string, string>) {
        if (!this.renderer) return;
        if (this.cityState === "in" && this.city) {
            this.city.focus(id);
            this.cityPlace = id;
            return;
        }
        this.cityPlace = id;
        this.cityLatLon = {lat, lon};
        this.cityState = "dive";
        this.cityT = 0;
        this.diveFrom.copy(this.camera.position);
        this.diveUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
        if (!this.cityLoad) {
            this.cityLoad = Promise.all([
                import("./city"),
                fetch("/places/olomouc.json").then((r) => {
                    if (!r.ok) throw new Error(`city data ${r.status}`);
                    return r.json();
                }),
            ]).then(([mod, data]) => {
                if (!this.running) return;
                this.city = new mod.City(data, {placeNames});
                this.city.resize(this.width, this.height);
            }).catch((err) => {
                console.warn("3D město se nenačetlo", err);
                this.cityLoad = null;
                this.cityState = "off";
            });
        }
    }

    exitPlace() {
        if (this.cityState === "off") return;
        this.city?.setDriving(false);
        this.cityState = "off";
        this.flash = 1;
    }

    cityCommand(cmd: CityCommand) {
        const c = this.city;
        if (!c) return;
        if (cmd.type === "drive") c.setDriving(cmd.value);
        else if (cmd.type === "focus") {
            this.cityPlace = cmd.value;
            c.focus(cmd.value);
        } else if (cmd.type === "target") c.setTarget(cmd.value);
        else if (cmd.type === "touch") c.setTouch(cmd.throttle, cmd.steer);
    }

    gameCommand(cmd: GameCommand) {
        const g = this.game;
        if (!g) return;
        if (cmd.type === "speed") g.setSpeed(cmd.value);
        else if (cmd.type === "time") g.setTime(cmd.value);
        else if (cmd.type === "focus") g.setFocus(cmd.value);
        else if (cmd.type === "rocket") g.launchRocket();
        else if (cmd.type === "demoThrow") g.demoThrow();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.portrait = this.width / this.height < 0.9;
        this.camera.aspect = this.width / this.height;
        this.camera.fov = this.portrait ? 60 : 45;
        this.camera.updateProjectionMatrix();
        this.scCamera.aspect = this.camera.aspect;
        this.scCamera.fov = this.portrait ? 62 : 45;
        this.scCamera.updateProjectionMatrix();
        if (this.renderer) {
            const ratio = Math.min(window.devicePixelRatio || 1, this.width < 800 ? 1.5 : 1.75);
            this.renderer.setPixelRatio(ratio);
            this.renderer.setSize(this.width, this.height, false);
            if (this.starMat) this.starMat.uniforms.uPixelRatio.value = ratio;
        }
        this.buildPath();
        this.buildPanels();
        this.city?.resize(this.width, this.height);
    }

    dispose() {
        this.running = false;
        cancelAnimationFrame(this.frame);
        document.removeEventListener("visibilitychange", this.onVisibility);
        this.canvas.removeEventListener("pointerdown", this.onPointerDown);
        this.canvas.removeEventListener("wheel", this.onWheel);
        this.game?.dispose();
        this.city?.dispose();
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.removeEventListener("pointercancel", this.onPointerUp);
        this.disposeShowcase();
        this.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            mesh.geometry?.dispose();
            const mat = mesh.material as (THREE.Material & {map?: THREE.Texture | null}) | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else {
                mat?.map?.dispose();
                mat?.dispose();
            }
        });
        (this.planetMat?.uniforms.uMap.value as THREE.Texture | null)?.dispose();
        this.renderer?.dispose();
    }

    private disposeShowcase() {
        if (!this.showcase) return;
        this.scPivot.remove(this.showcase.group);
        this.showcase.dispose();
        this.showcase = null;
    }

    private onVisibility = () => {
        if (document.hidden) {
            cancelAnimationFrame(this.frame);
        } else if (this.running) {
            this.last = performance.now();
            this.frame = requestAnimationFrame(this.tick);
        }
    };

    // --- tažení: otáčí Zemí (nebo hologramem), klik na satelit otevře projekt ---
    private ndc(e: PointerEvent | WheelEvent) {
        return new THREE.Vector2((e.clientX / this.width) * 2 - 1, -(e.clientY / this.height) * 2 + 1);
    }

    private onWheel = (e: WheelEvent) => {
        if (this.zoomBy(e.deltaY)) e.preventDefault();
    };

    /** zoom ve městě nebo ve hře; deltaY jako u kolečka myši */
    private zoomBy(deltaY: number): boolean {
        if (this.cityState === "in" && this.city) {
            this.city.zoom(deltaY);
            return true;
        }
        if (!this.game || this.gameTarget === 0) return false;
        this.game.zoom(deltaY);
        return true;
    }

    private pinchSpan() {
        const [a, b] = Array.from(this.touches.values());
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    /** druhý prst: místo tažení začne pinch (rozehraný hod se nepustí, jen zruší) */
    private trackTouch(e: PointerEvent): boolean {
        if (e.pointerType !== "touch") return false;
        this.touches.set(e.pointerId, {x: e.clientX, y: e.clientY});
        if (this.touches.size !== 2 || (this.cityState !== "in" && !(this.game && this.gameTarget > 0))) return false;
        if (this.drag) {
            if (this.cityState === "in") this.city?.pointerUp();
            else this.game?.cancelAim();
            this.drag = null;
        }
        this.pinchDist = this.pinchSpan();
        return true;
    }

    private onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        if (this.trackTouch(e)) return;
        if (this.cityState !== "off") {
            if (this.city && this.cityState === "in") this.city.pointerDown(e.clientX, e.clientY);
            this.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0};
            return;
        }
        if (this.game && this.gameTarget > 0) {
            this.canvas.setPointerCapture?.(e.pointerId);
            this.game.pointerDown(this.ndc(e), this.camera, e.clientX, e.clientY);
            this.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0};
            return;
        }
        this.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0};
        this.yawVel = 0;
        this.pitchVel = 0;
    };

    private onPointerMove = (e: PointerEvent) => {
        if (this.touches.has(e.pointerId)) {
            this.touches.set(e.pointerId, {x: e.clientX, y: e.clientY});
            if (this.pinchDist > 0 && this.touches.size === 2) {
                const span = this.pinchSpan();
                // stejné měřítko jako kolečko: zoom(dy) násobí vzdálenost exp(dy * 0.0012)
                if (span > 0) this.zoomBy(Math.log(this.pinchDist / span) / 0.0012);
                this.pinchDist = span;
                return;
            }
        }
        const d = this.drag;
        if (this.cityState !== "off") {
            if (d && d.id === e.pointerId && this.city) this.city.pointerMove(e.clientX, e.clientY);
            return;
        }
        if (this.game && this.gameTarget > 0) {
            if (!d || d.id !== e.pointerId) {
                if (e.pointerType === "mouse" && e.target === this.canvas) {
                    this.canvas.style.cursor = this.game.overEarth(this.ndc(e), this.camera) ? "grab" : "";
                }
                return;
            }
            this.game.pointerMove(this.ndc(e), this.camera, e.clientX, e.clientY);
            if (this.game.state === "aim") this.canvas.style.cursor = "grabbing";
            return;
        }
        if (!d || d.id !== e.pointerId) {
            if (e.pointerType === "mouse" && this.scMix < 0.01) this.hoverSatellites(e);
            return;
        }
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        d.moved += Math.abs(dx) + Math.abs(dy);
        const k = 0.006;
        if (this.scTarget > 0) {
            this.scYaw += dx * k;
            this.scPitch = THREE.MathUtils.clamp(this.scPitch + dy * k, -0.6, 1.1);
        } else {
            this.yaw += dx * k;
            this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.2, 1.2);
            this.yawVel = dx * k * 60;
            this.pitchVel = dy * k * 60;
        }
    };

    private onPointerUp = (e: PointerEvent) => {
        this.touches.delete(e.pointerId);
        if (this.touches.size < 2) this.pinchDist = 0;
        const d = this.drag;
        if (!d || d.id !== e.pointerId) return;
        this.drag = null;
        if (this.cityState !== "off") {
            this.city?.pointerUp();
            return;
        }
        if (this.game && this.gameTarget > 0) {
            this.game.pointerUp();
            this.canvas.style.cursor = "";
            return;
        }
        if (d.moved < 6 && this.scTarget === 0) {
            const hit = this.pickSatellite(e);
            if (hit >= 0) this.opts.onSatellite(hit);
        }
    };

    private pickSatellite(e: PointerEvent): number {
        if (!this.satellites.length) return -1;
        const ndc = new THREE.Vector2((e.clientX / this.width) * 2 - 1, -(e.clientY / this.height) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.camera);
        const hits = this.raycaster.intersectObjects(this.satellites.map((s) => s.hit), false);
        if (!hits.length) return -1;
        return this.satellites.findIndex((s) => s.hit === hits[0].object);
    }

    private hoverSatellites(e: PointerEvent) {
        if (e.target !== this.canvas) return;
        this.canvas.style.cursor = this.pickSatellite(e) >= 0 ? "pointer" : "";
    }

    private build() {
        const scene = this.scene;
        scene.add(this.camera);

        // Země: planeta + značka domova se otáčí spolu
        const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), planetMaterial());
        this.planetMat = planet.material as THREE.ShaderMaterial;
        this.globe.add(planet);
        this.earth.add(this.globe);
        scene.add(this.earth);

        // nejdřív malá textura (rychle vidět Zemi), ostrá se dotáhne a vymění
        const loader = new THREE.TextureLoader();
        let sharp = false;
        const useMap = (tex: THREE.Texture, full: boolean) => {
            if (!this.planetMat || (sharp && !full)) {
                tex.dispose();
                return;
            }
            tex.colorSpace = THREE.NoColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.anisotropy = this.renderer?.capabilities.getMaxAnisotropy() ?? 1;
            const old = this.planetMat.uniforms.uMap.value as THREE.Texture | null;
            this.planetMat.uniforms.uMap.value = tex;
            old?.dispose();
            sharp ||= full;
        };
        loader.load("/textures/earth-1024.webp", (tex) => {
            useMap(tex, false);
            loader.load("/textures/earth.webp", (full) => useMap(full, true));
        }, undefined, () => loader.load("/textures/earth.webp", (full) => useMap(full, true)));

        const markerMat = new THREE.MeshBasicMaterial({
            color: 0x6ef2c0, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x6ef2c0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.29, 40), markerMat);
        const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.53, 48), markerMat);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), markerMat);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.2, 6), beamMat);
        beam.rotation.x = Math.PI / 2;
        beam.position.z = 1.1;
        ring2.name = "pulse";
        this.homeMarker.add(ring, ring2, dot, beam);
        const normal = this.homeLocal.clone();
        this.homeMarker.position.copy(normal).multiplyScalar(R * 1.003);
        this.homeMarker.lookAt(normal.multiplyScalar(R * 2));
        this.globe.add(this.homeMarker);

        this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 96, 64), atmosphereMaterial());
        this.earth.add(this.atmosphere);

        // drátěný holo-obal
        const shellGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(R * 1.22, 3));
        this.shell = new THREE.LineSegments(shellGeo, new THREE.LineBasicMaterial({
            color: 0x38d6ff, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.earth.add(this.shell);

        // orbitální prstence
        const ringDefs: Array<[number, number, number, number, number, number]> = [
            [R * 1.45, R * 1.47, 1.35, 0.2, 90, 0.01],
            [R * 1.62, R * 1.625, 1.2, -0.35, 240, -0.004],
            [R * 1.9, R * 1.93, 1.5, 0.5, 36, 0.006],
        ];
        ringDefs.forEach(([inner, outer, tx, tz, dashes, speed], i) => {
            const mat = ringMaterial(new THREE.Color(i === 1 ? 0x2f6bff : 0x38d6ff), dashes, speed, i === 1 ? 0.35 : 0.22);
            const r = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 256), mat);
            r.rotation.set(tx, 0, tz);
            this.rings.push(r);
            this.ringMats.push(mat);
            this.earth.add(r);
        });

        // satelity = projekty; kliknutím se otevře hologram projektu
        const satGeo = new THREE.OctahedronGeometry(0.34, 0);
        const hitGeo = new THREE.SphereGeometry(1.4, 8, 6);
        const hitMat = new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false});
        this.opts.projectTitles.forEach((title, i) => {
            const radius = R * (1.38 + i * 0.13);
            const pivot = new THREE.Object3D();
            pivot.rotation.set(0.4 + i * 0.37, i * 1.25, (i % 2 ? -1 : 1) * 0.25);
            const body = new THREE.Mesh(satGeo, new THREE.MeshBasicMaterial({color: i % 2 ? 0x8fd8ff : 0x58a6ff}));
            body.position.set(radius, 0, 0);
            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({
                color: 0x38d6ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false,
            }));
            body.add(glow);
            const hit = new THREE.Mesh(hitGeo, hitMat);
            body.add(hit);
            const label = textSprite(title);
            label.position.set(0, 1.2, 0);
            body.add(label);
            pivot.add(body);

            const orbitPts = new THREE.EllipseCurve(0, 0, radius, radius).getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y));
            const orbitMat = new THREE.LineBasicMaterial({
                color: 0x58a6ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false,
            });
            this.orbitMats.push(orbitMat);
            pivot.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPts), orbitMat));

            this.satellites.push({pivot, body, hit, label, speed: 0.05 + (i % 3) * 0.025});
            this.earth.add(pivot);
        });

        // hvězdy
        const count = window.innerWidth < 800 ? 1800 : 3500;
        const pos = new Float32Array(count * 3);
        const size = new Float32Array(count);
        const seed = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const r = 280 + Math.random() * 420;
            const u = Math.random() * 2 - 1;
            const th = Math.random() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
            size[i] = Math.random() < 0.06 ? 2.6 : 0.6 + Math.random() * 1.2;
            seed[i] = Math.random();
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        starGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
        starGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
        this.starMat = starMaterial();
        this.stars = new THREE.Points(starGeo, this.starMat);
        this.stars.frustumCulled = false;
        scene.add(this.stars);

        // warp: světelné čáry kolem kamery, viditelné jen při rychlém přeletu
        const lines = 180;
        this.warpBase = new Float32Array(lines * 3);
        const warpPos = new Float32Array(lines * 6);
        for (let i = 0; i < lines; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 2.5 + Math.random() * 12;
            this.warpBase.set([Math.cos(a) * r, Math.sin(a) * r, -5 - Math.random() * 80], i * 3);
        }
        const warpGeo = new THREE.BufferGeometry();
        warpGeo.setAttribute("position", new THREE.BufferAttribute(warpPos, 3));
        this.warp = new THREE.LineSegments(warpGeo, new THREE.LineBasicMaterial({
            color: 0x8fdcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.warp.frustumCulled = false;
        this.camera.add(this.warp);

        // hologram projektů: projekční "podstava" + ztmavení Země
        const base = new THREE.PolarGridHelper(7.5, 12, 6, 64, 0x38d6ff, 0x1d4f8a);
        (base.material as THREE.Material).transparent = true;
        (base.material as THREE.Material).opacity = 0.35;
        base.position.y = -3.4;
        this.scPivot.add(base);
        this.scScene.add(this.scPivot);
        const dim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dimMat);
        this.dimScene.add(dim);
        this.flashScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.flashMat));
    }

    /** křivky letu, natočení Země a pozice značek; závisí na poměru stran */
    private buildPath() {
        const worldUp = new THREE.Vector3(0, 1, 0);
        const cams: THREE.Vector3[] = [];
        const targets: THREE.Vector3[] = [];
        const ups: THREE.Vector3[] = [];

        STATIONS.forEach((s) => {
            const cam = new THREE.Vector3(...s.cam);
            if (s.horizon) {
                // let nad povrchem: dopředu po tečně, sklopit dolů k horizontu
                const radial = cam.clone().normalize();
                const heading = new THREE.Vector3(...s.horizon.heading);
                const forward = heading.sub(radial.clone().multiplyScalar(radial.dot(heading))).normalize();
                const tilt = THREE.MathUtils.degToRad(this.portrait ? 52 : 34);
                forward.multiplyScalar(Math.cos(tilt)).addScaledVector(radial, -Math.sin(tilt));
                cams.push(cam);
                targets.push(cam.clone().addScaledVector(forward, 30));
                ups.push(radial);
                return;
            }
            if (this.portrait) cam.multiplyScalar(1.45);
            const dist = cam.length();
            const fwd = cam.clone().negate().normalize();
            const right = new THREE.Vector3().crossVectors(fwd, worldUp).normalize();
            const up = new THREE.Vector3().crossVectors(right, fwd);
            const [sx, sy] = this.portrait ? [0, -0.23 * dist] : (s.shift ?? [0, 0]);
            cams.push(cam);
            targets.push(right.multiplyScalar(sx).addScaledVector(up, sy));
            ups.push(worldUp.clone());
        });

        this.camCurve = new THREE.CatmullRomCurve3(cams, false, "centripetal");
        this.targetCurve = new THREE.CatmullRomCurve3(targets, false, "centripetal");
        this.upCurve = new THREE.CatmullRomCurve3(ups, false, "centripetal");

        // Natočení Země pro každou zastávku: Olomouc míří tam, kde paprsek
        // skrz markerNdc protne kouli, sever co nejvíc "nahoru" na obrazovce.
        const basis = (a: THREE.Vector3, upHint: THREE.Vector3) => {
            const x = a.clone().normalize();
            const y = upHint.clone().addScaledVector(x, -x.dot(upHint)).normalize();
            const z = new THREE.Vector3().crossVectors(x, y);
            return new THREE.Matrix4().makeBasis(x, y, z);
        };
        const localInv = basis(this.homeLocal, worldUp).transpose();
        const ray = new THREE.Raycaster();
        const sphere = new THREE.Sphere(new THREE.Vector3(), R);
        this.stationCams = [];
        this.stationQuats = STATIONS.map((s, i) => {
            const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, 0.1, 2000);
            cam.position.copy(cams[i]);
            cam.up.copy(ups[i]);
            cam.lookAt(targets[i]);
            cam.updateMatrixWorld();
            this.stationCams.push(cam);
            const ndc = this.portrait
                ? new THREE.Vector2(s.markerNdc[0] * 0.4, s.horizon ? 0.1 : 0.45)
                : new THREE.Vector2(...s.markerNdc);
            ray.setFromCamera(ndc, cam);
            const hit = new THREE.Vector3();
            if (!ray.ray.intersectSphere(sphere, hit)) hit.copy(cams[i]).normalize().multiplyScalar(R);
            const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
            const m = basis(hit, screenUp).multiply(localInv);
            return new THREE.Quaternion().setFromRotationMatrix(m);
        });
    }

    /** světové matice panelů: na zastávce visí před kamerou v hloubce D, 1 px = 1 px */
    private buildPanels() {
        if (!this.stationCams.length) return;
        const D = 16;
        this.panelMatrices = [];
        this.panelPositions = [];
        this.stationCams.forEach((cam, i) => {
            const layout = this.panelLayouts[i] ?? {ndcX: 0, ndcY: 0, yaw: 0};
            const fovPx = cam.projectionMatrix.elements[5] * (this.height / 2);
            const dir = new THREE.Vector3(layout.ndcX, layout.ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
            const pos = cam.position.clone().addScaledVector(dir, D / Math.max(dir.dot(forward), 0.2));
            const quat = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), layout.yaw));
            const s = D / fovPx;
            this.panelMatrices.push(new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(s, s, s)));
            this.panelPositions.push(pos);
        });
    }

    private tick = (now: number) => {
        const realDt = Math.max((now - this.last) / 1000, 0);
        const dt = Math.min(realDt, 0.05);
        this.last = now;
        this.elapsed += dt;
        const t = this.elapsed;
        const reduced = this.opts.reducedMotion;

        // vyhlazení scrollu + rychlost pro "warp"
        const before = this.progress;
        const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
        this.progress += (this.target - this.progress) * k;
        if (Math.abs(this.target - this.progress) < 0.0005) this.progress = this.target;
        const instVel = dt > 0 ? (this.progress - before) / dt : 0;
        this.velocity += (instVel - this.velocity) * Math.min(dt * 6, 1);
        this.pointerSmooth.lerp(this.pointer, Math.min(dt * 2.5, 1));
        if (this.intro < 1) this.intro = Math.min(this.intro + Math.min(realDt, 0.25) / 3.4, 1);

        const last = STATIONS.length - 1;
        const active = Math.round(this.progress);
        if (active !== this.activeStation) {
            this.activeStation = active;
            this.yawVel = 0;
            this.pitchVel = 0;
        }

        let marker: FrameState["marker"] = null;
        let altitude = 0;
        let lat = 0;
        let lon = 0;
        const css: FrameState["css"] = {perspective: 0, camera: "", panels: []};

        if (this.camCurve && this.targetCurve && this.upCurve) {
            const u = Math.min(Math.max(this.progress / last, 0), 1);
            const pos = this.camCurve.getPoint(u);
            const look = this.targetCurve.getPoint(u);
            const up = this.upCurve.getPoint(u).normalize();

            // úvodní přílet z hlubokého vesmíru
            const e = 1 - Math.pow(1 - this.intro, 4);
            if (e < 1) pos.lerpVectors(new THREE.Vector3(-60, 70, 260), pos, e);

            // jemný parallax myší
            const right = new THREE.Vector3().subVectors(look, pos).cross(up).normalize();
            pos.addScaledVector(right, this.pointerSmooth.x * 1.6);
            pos.addScaledVector(up, this.pointerSmooth.y * 1.2);

            const minDist = R * 1.12;
            if (pos.length() < minDist) pos.setLength(minDist);

            this.camera.position.copy(pos);
            this.camera.up.copy(up);
            this.camera.lookAt(look);
            // náklon při rychlém přeletu, jako by kamera zatáčela
            this.camera.rotateZ(THREE.MathUtils.clamp(-this.velocity * 0.12, -0.25, 0.25));
            this.camera.updateMatrixWorld();

            altitude = pos.length() - R;
            const dir = pos.clone().normalize();
            lat = THREE.MathUtils.radToDeg(Math.asin(dir.y));
            lon = THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x));

            // --- natočení Země: zastávka (slerp mezi zastávkami) + uživatel ---
            if (this.stationQuats.length) {
                const seg = Math.min(Math.floor(this.progress), last - 1);
                const f = THREE.MathUtils.clamp(this.progress - seg, 0, 1);
                const q = new THREE.Quaternion().slerpQuaternions(this.stationQuats[seg], this.stationQuats[seg + 1], f);
                // intro: Země se "dotočí" na Česko
                if (e < 1) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (1 - e) * -3.6));
                if (!this.drag) {
                    // setrvačnost po puštění, pak pomalý návrat domů
                    this.yaw += this.yawVel * dt;
                    this.pitch += this.pitchVel * dt;
                    this.yawVel *= Math.exp(-dt * 2.2);
                    this.pitchVel *= Math.exp(-dt * 2.2);
                    if (Math.abs(this.yawVel) < 0.05) this.yaw *= Math.exp(-dt * 0.35);
                    if (Math.abs(this.pitchVel) < 0.05) this.pitch *= Math.exp(-dt * 0.6);
                    if (Math.abs(this.velocity) > 0.05) {
                        // při přeletu se rychle srovná
                        this.yaw *= Math.exp(-dt * 4);
                        this.pitch *= Math.exp(-dt * 4);
                    }
                }
                const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
                const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
                const user = new THREE.Quaternion().setFromAxisAngle(camUp, this.yaw)
                    .multiply(new THREE.Quaternion().setFromAxisAngle(camRight, this.pitch));
                this.globe.quaternion.copy(user.multiply(q));
            }

            // --- herní režim: plynulý přechod ze scroll kamery na herní ---
            this.blendGame(dt);
            // --- ponor k místu na Zemi (škola / práce) ---
            this.updateDive(realDt);

            // --- CSS 3D pro panely ---
            const fovPx = this.camera.projectionMatrix.elements[5] * (this.height / 2);
            css.perspective = fovPx;
            css.camera = `translateZ(${fovPx}px) ${cssCameraMatrix(this.camera.matrixWorldInverse)} translate(${this.width / 2}px,${this.height / 2}px)`;
            const tmp = new THREE.Vector3();
            css.panels = this.panelMatrices.map((m, i) => ({
                transform: cssObjectMatrix(m),
                depth: -tmp.copy(this.panelPositions[i]).applyMatrix4(this.camera.matrixWorldInverse).z,
            }));

            // --- značka domova ---
            const nearStation = 1 - Math.min(Math.abs(this.progress - active) * 2.2, 1);
            const mp = new THREE.Vector3();
            this.globe.updateMatrixWorld();
            this.homeMarker.getWorldPosition(mp);
            const pulse = this.homeMarker.getObjectByName("pulse");
            if (pulse) pulse.scale.setScalar(1 + ((t * 0.8) % 1) * 1.6);
            const near3d = THREE.MathUtils.clamp(mp.distanceTo(this.camera.position) / 25, 0.3, 1.2);
            this.homeMarker.scale.setScalar(near3d);
            const toCam = this.camera.position.clone().sub(mp).normalize();
            const facing = toCam.dot(mp.clone().normalize()) > 0.08;
            if (facing && nearStation > 0.05 && this.scMix < 0.5 && this.gameMix < 0.05 && this.cityState === "off") {
                mp.project(this.camera);
                if (mp.z < 1 && Math.abs(mp.x) < 1.05 && Math.abs(mp.y) < 1.05) {
                    marker = {x: (mp.x + 1) / 2 * this.width, y: (1 - mp.y) / 2 * this.height};
                }
            }
        }

        if (this.renderer) {
            this.renderer.clear();
            if (this.cityState === "in" && this.city) {
                this.city.update(dt);
                this.renderer.render(this.city.scene, this.city.camera);
            } else {
                this.animateScene(t, dt);
                this.renderer.render(this.scene, this.camera);
                this.renderShowcase(dt);
            }
            // záblesk při přechodu Země ↔ město
            if (this.flash > 0.004) {
                this.flashMat.opacity = this.flash;
                this.renderer.render(this.flashScene, this.dimCamera);
                this.flash *= Math.exp(-dt * 2.6);
            } else {
                this.flash = 0;
            }
        }

        const game = this.game && this.gameMix > 0 ? this.game.hud() : null;
        const city = this.cityState === "off" ? null
            : this.cityState === "in" && this.city ? {...this.city.hud(), loading: false}
                : {driving: false, speed: 0, place: this.cityPlace, target: null, targetDist: 0, arrived: 0, loading: true};
        this.opts.onFrame({progress: this.progress, velocity: this.velocity, marker, altitude, lat, lon, css, game, city});
        if (this.running && !document.hidden) this.frame = requestAnimationFrame(this.tick);
    };

    private updateDive(dt: number) {
        if (this.cityState !== "dive") return;
        this.cityT = Math.min(this.cityT + dt / 2.1, 1);
        const k = this.cityT;
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const local = latLonToVec(this.cityLatLon.lat, this.cityLatLon.lon);
        this.globe.updateMatrixWorld();
        const surface = this.globe.localToWorld(local.clone().multiplyScalar(R));
        const normal = surface.clone().sub(this.earth.position).normalize();
        // nejdřív nad místo (kolmo), pak dolů až k povrchu
        const above = surface.clone().addScaledVector(normal, R * 0.9);
        const end = surface.clone().addScaledVector(normal, R * 0.012);
        const mid = new THREE.Vector3().lerpVectors(this.diveFrom, above, Math.min(e * 1.6, 1));
        const pos = mid.lerp(end, Math.max(0, (e - 0.55) / 0.45) ** 2);
        this.camera.position.copy(pos);
        this.camera.up.copy(this.diveUp);
        this.camera.lookAt(surface);
        this.camera.updateMatrixWorld();
        if (k > 0.82) this.flash = Math.max(this.flash, (k - 0.82) / 0.18);
        if (k >= 1 && this.city) {
            this.cityState = "in";
            this.flash = 1;
            this.city.focus(this.cityPlace, true);
        }
    }

    private blendGame(dt: number) {
        const g = this.game;
        if (!g || (this.gameMix === 0 && this.gameTarget === 0)) {
            this.earth.position.set(0, 0, 0);
            this.earth.visible = true;
            this.earth.scale.setScalar(1);
            if (this.planetMat) {
                (this.planetMat.uniforms.uSun.value as THREE.Vector3).copy(this.defaultSun);
                this.planetMat.uniforms.uSharp.value = 0;
            }
            return;
        }
        this.gameMix += (this.gameTarget - this.gameMix) * (1 - Math.exp(-dt * 2.2));
        if (this.gameTarget === 0 && this.gameMix < 0.002) this.gameMix = 0;
        if (this.gameTarget === 1 && this.gameMix > 0.998) this.gameMix = 1;
        const gm = this.gameMix * this.gameMix * (3 - 2 * this.gameMix);
        g.update(dt, gm);
        const pose = g.pose();
        this.gameCam.position.copy(pose.pos);
        this.gameCam.up.set(0, 1, 0);
        this.gameCam.lookAt(pose.target);
        this.camera.position.lerp(pose.pos, gm);
        this.camera.quaternion.slerp(this.gameCam.quaternion, gm);
        this.camera.updateMatrixWorld();
        this.earth.position.copy(g.earthPos).multiplyScalar(gm);
        this.earth.visible = g.earthVisible || gm < 0.5;
        this.earth.scale.setScalar(THREE.MathUtils.lerp(1, g.earthScale, gm));
        this.globe.quaternion.slerp(g.globeQuat, gm);
        this.globe.updateMatrixWorld();
        if (this.planetMat) {
            (this.planetMat.uniforms.uSun.value as THREE.Vector3).copy(this.defaultSun).lerp(g.sunDir, gm).normalize();
            this.planetMat.uniforms.uSharp.value = gm;
        }
    }

    private animateScene(t: number, dt: number) {
        const reduced = this.opts.reducedMotion;
        if (this.planetMat) {
            this.planetMat.uniforms.uTime.value = t;
            const mix = this.planetMat.uniforms.uMapMix;
            if (this.planetMat.uniforms.uMap.value && mix.value < 1) mix.value = Math.min(mix.value + dt * 1.5, 1);
        }
        if (this.starMat) {
            this.starMat.uniforms.uTime.value = t;
            this.starMat.uniforms.uWarp.value = Math.min(Math.abs(this.velocity) * 0.9, 1.5);
            // ve hře jsou hvězdy "nekonečně" daleko — za planetami
            const gm = this.gameMix;
            this.starMat.uniforms.uScale.value = 1 + gm * 5;
            if (this.stars) {
                this.stars.scale.setScalar(1 + gm * 5);
                this.stars.position.copy(this.camera.position).multiplyScalar(gm);
            }
        }
        const orbitals = this.gameMix < 0.35;
        this.rings.forEach((r) => (r.visible = orbitals));
        if (this.shell) this.shell.visible = orbitals;
        this.satellites.forEach((s) => (s.pivot.visible = orbitals));
        const ringBoost = 1 - Math.min(Math.abs(this.progress - 2), 1);
        this.ringMats.forEach((m) => {
            m.uniforms.uTime.value = t;
            m.uniforms.uBoost.value = ringBoost * 0.35;
        });
        if (this.shell) {
            this.shell.rotation.y = t * 0.02;
            this.shell.rotation.x = t * 0.007;
        }
        this.rings.forEach((ring, i) => {
            ring.rotation.z += dt * (i % 2 ? -0.02 : 0.015);
        });
        const projectsFocus = 1 - Math.min(Math.abs(this.progress - 3), 1);
const bodyPos = new THREE.Vector3();
        this.satellites.forEach(({pivot, body, label, speed}) => {
            pivot.rotation.y += dt * speed * (reduced ? 0.2 : 1) * (1 - projectsFocus * 0.7);
            body.rotation.y += dt;
            // těsně u kamery (let nad horizontem) by satelit zakryl půl obrazovky
            body.visible = body.getWorldPosition(bodyPos).distanceTo(this.camera.position) > 6;
            (label.material as THREE.SpriteMaterial).opacity = projectsFocus;
            label.visible = projectsFocus > 0.02;
        });
        this.orbitMats.forEach((m) => {
            m.opacity = 0.07 + projectsFocus * 0.3;
        });

        // warp čáry
        if (this.warp && this.warpBase) {
            const speed = Math.abs(this.velocity);
            const mat = this.warp.material as THREE.LineBasicMaterial;
            mat.opacity = reduced ? 0 : THREE.MathUtils.clamp(speed * 0.55 - 0.08, 0, 0.55);
            this.warp.visible = mat.opacity > 0.01;
            if (this.warp.visible) {
                const attr = this.warp.geometry.getAttribute("position") as THREE.BufferAttribute;
                const arr = attr.array as Float32Array;
                const len = 1.5 + speed * 7;
                for (let i = 0; i < this.warpBase.length / 3; i++) {
                    let z = this.warpBase[i * 3 + 2] + dt * (30 + speed * 140);
                    if (z > -3) z -= 82;
                    this.warpBase[i * 3 + 2] = z;
                    const x = this.warpBase[i * 3];
                    const y = this.warpBase[i * 3 + 1];
                    arr.set([x, y, z, x, y, z - len], i * 6);
                }
                attr.needsUpdate = true;
            }
        }
    }

    private renderShowcase(dt: number) {
        if (!this.renderer) return;
        const k = 1 - Math.exp(-dt * (this.scTarget ? 4 : 6));
        this.scMix += (this.scTarget - this.scMix) * k;
        if (this.scTarget === 0 && this.scMix < 0.003) {
            this.scMix = 0;
            this.dimMat.opacity = 0;
            this.disposeShowcase();
            return;
        }
        if (!this.showcase) return;
        this.scTime += dt;
        this.showcase.update(this.scTime, dt);
        if (!this.drag) this.scYaw += dt * 0.12;
        this.scPivot.rotation.set(0, this.scYaw, 0);
        const dist = (this.portrait ? 25 : 21) + (1 - this.scMix) * 14;
        this.scCamera.position.set(0, Math.sin(this.scPitch) * dist, Math.cos(this.scPitch) * dist);
        // na širokém displeji hologram vpravo, vlevo zůstane místo pro popis
        this.scCamera.lookAt(this.portrait ? 0 : -5.2, this.portrait ? -6.5 : 0, 0);
        this.scPivot.scale.setScalar(0.4 + this.scMix * 0.6);
        this.dimMat.opacity = 0.88 * this.scMix;
        this.renderer.render(this.dimScene, this.dimCamera);
        this.renderer.clearDepth();
        this.renderer.render(this.scScene, this.scCamera);
    }
}
