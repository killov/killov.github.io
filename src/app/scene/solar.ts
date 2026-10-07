import * as THREE from "three";

/**
 * Herní režim "vesmír": Slunce, planety a Měsíc na skutečných (kruhových)
 * drahách podle data, ovládání času a minihra — Zemi jde jako prakem chytit,
 * natáhnout a hodit; gravitace Slunce ji stáhne a při zásahu se rozpadne.
 * Odpalování raket z Olomouce na Měsíc.
 *
 * Vzdálenosti jsou stlačené (jinak by planety nebyly vidět), polohy a čas
 * ale odpovídají skutečnosti: den/noc na Zemi, fáze Měsíce, kde jsou planety.
 *
 * Fyzika hodu běží v reálném čase, nezávisle na zrychlení simulace.
 */

const R = 10; // poloměr Země ve scéně (stejný jako v Universe)
const AU = 320;
const SUN_R = 40;
const MOON_DIST = 44;
const MOON_R = 2.7;
const GM = 1.25e6;
const MAX_PULL = 42;
const LAUNCH_K = 4.2;
const DEG = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);

export type GameFocus = "earth" | "sun" | "system";
export type GameTarget = "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn";

export interface GameEvent {
    id: number;
    kind: "hit" | "crash" | "lost" | "rocket" | "throw";
    target?: GameTarget;
}

export interface GameHud {
    time: number;
    speed: number;
    state: "orbit" | "aim" | "fly" | "shattered" | "return";
    hits: number;
    throws: number;
    rockets: number;
    event: GameEvent | null;
}

interface PlanetDef {
    id: GameTarget;
    a: number; // velká poloosa v AU
    L0: number; // střední délka v J2000 (°)
    rate: number; // °/den
    radius: number;
    color: number;
    color2: number;
    bands: number;
}

const PLANETS: PlanetDef[] = [
    {id: "mercury", a: 0.387, L0: 252.25, rate: 4.09233, radius: 3.2, color: 0x9c8f86, color2: 0x5d5550, bands: 0},
    {id: "venus", a: 0.723, L0: 181.98, rate: 1.60213, radius: 7.4, color: 0xe8c98a, color2: 0xb98c4c, bands: 6},
    {id: "mars", a: 1.524, L0: 355.43, rate: 0.52403, radius: 5.2, color: 0xd2643a, color2: 0x7a3420, bands: 0},
    {id: "jupiter", a: 5.203, L0: 34.35, rate: 0.08309, radius: 22, color: 0xe2c49c, color2: 0x9a6a46, bands: 22},
    {id: "saturn", a: 9.537, L0: 50.08, rate: 0.03346, radius: 18, color: 0xe9d7a6, color2: 0xa98d5c, bands: 16},
];

/** stlačení vzdáleností: vnitřní planety skoro reálně, vnější blíž */
const orbitRadius = (a: number) => AU * Math.pow(a, 0.62);

const days = (ms: number) => (ms - J2000) / 86400000;

/** heliocentrická poloha v rovině ekliptiky (x = 0°, -z = 90°, jako latLonToVec) */
function helio(L: number, dist: number, out = new THREE.Vector3()) {
    return out.set(Math.cos(L * DEG) * dist, 0, -Math.sin(L * DEG) * dist);
}

/** bod pod Sluncem (zeměpisná šířka/délka) pro daný čas */
function subsolar(ms: number): {lat: number; lon: number} {
    const d = days(ms);
    const g = (357.528 + 0.9856003 * d) * DEG;
    const lambda = (280.46 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
    const eps = 23.439 * DEG;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const gmst = (280.46061837 + 360.98564736629 * d) * DEG;
    let lon = (ra - gmst) / DEG;
    lon = ((lon + 540) % 360) - 180;
    return {lat: dec / DEG, lon};
}

function latLon(lat: number, lon: number, out = new THREE.Vector3()) {
    const phi = lat * DEG;
    const lam = lon * DEG;
    return out.set(Math.cos(phi) * Math.cos(lam), Math.sin(phi), -Math.cos(phi) * Math.sin(lam));
}

const VALUE_NOISE = /* glsl */ `
float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
}
`;

const BODY_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
}
`;

function bodyMaterial(color: number, color2: number, bands: number, sunPos: THREE.Vector3): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
            uSunPos: {value: sunPos},
            uColor: {value: new THREE.Color(color)},
            uColor2: {value: new THREE.Color(color2)},
            uBands: {value: bands},
            uOpacity: {value: 1},
        },
        vertexShader: BODY_VERTEX,
        fragmentShader: /* glsl */ `
            uniform vec3 uSunPos;
            uniform vec3 uColor;
            uniform vec3 uColor2;
            uniform float uBands;
            uniform float uOpacity;
            varying vec3 vWorld;
            varying vec3 vNormal;
            varying vec3 vLocal;
            ${VALUE_NOISE}
            void main() {
                vec3 n = normalize(vNormal);
                vec3 l = normalize(uSunPos - vWorld);
                vec3 v = normalize(cameraPosition - vWorld);
                vec3 p = normalize(vLocal);
                float nz = vnoise(p * 4.0) * 0.55 + vnoise(p * 10.0) * 0.3 + vnoise(p * 24.0) * 0.15;
                float t = uBands > 0.0 ? sin(p.y * uBands + nz * 3.0) * 0.5 + 0.5 : nz;
                vec3 base = mix(uColor2, uColor, t);
                float diff = smoothstep(-0.06, 0.35, dot(n, l));
                vec3 col = base * (0.07 + 0.93 * diff);
                float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
                col += mix(vec3(0.2, 0.55, 1.0), uColor, 0.5) * fres * (0.25 + 0.5 * diff);
                gl_FragColor = vec4(col, uOpacity);
            }
        `,
    });
}

function sunMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {uTime: {value: 0}, uOpacity: {value: 1}, uHeat: {value: 0}},
        vertexShader: BODY_VERTEX,
        fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform float uOpacity;
            uniform float uHeat;
            varying vec3 vWorld;
            varying vec3 vNormal;
            varying vec3 vLocal;
            ${VALUE_NOISE}
            void main() {
                vec3 p = normalize(vLocal);
                float n = vnoise(p * 5.0 + uTime * 0.12) * 0.5 + vnoise(p * 13.0 - uTime * 0.2) * 0.3 + vnoise(p * 34.0 + uTime * 0.35) * 0.2;
                vec3 col = mix(vec3(1.0, 0.38, 0.05), vec3(1.0, 0.93, 0.6), smoothstep(0.25, 0.8, n));
                float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(cameraPosition - vWorld)), 0.0), 2.0);
                col = mix(col, vec3(1.0, 0.55, 0.15), fres * 0.7);
                col += vec3(1.0, 0.8, 0.5) * uHeat;
                gl_FragColor = vec4(col * 1.2, uOpacity);
            }
        `,
    });
}

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner);
    g.addColorStop(0.25, outer);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function nameSprite(text: string, color: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = "600 38px 'JetBrains Mono', ui-monospace, monospace";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 36;
    canvas.width = w;
    canvas.height = 60;
    ctx.font = font;
    ctx.fillStyle = "rgba(2, 10, 24, 0.65)";
    ctx.fillRect(0, 0, w, 60);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 18, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, sizeAttenuation: false}));
    const h = 0.02;
    sprite.scale.set((h * w) / 60, h, 1);
    sprite.center.set(0.5, -0.6);
    return sprite;
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

interface Rocket {
    group: THREE.Group;
    flame: THREE.Mesh;
    trail: THREE.Line;
    trailPts: THREE.Vector3[];
    start: THREE.Vector3; // vůči Zemi
    t: number;
    done: boolean;
}

export interface SpaceGameOptions {
    names: Record<GameTarget | "earth", string>;
    homeLocal: THREE.Vector3;
}

export class SpaceGame {
    readonly group = new THREE.Group();
    readonly sunPos = new THREE.Vector3();
    readonly earthPos = new THREE.Vector3();
    readonly sunDir = new THREE.Vector3(1, 0, 0);
    readonly globeQuat = new THREE.Quaternion();
    earthVisible = true;
    /** jak moc je Země vidět (0 = rozbitá) */
    earthScale = 1;

    simTime = Date.now();
    speed = 3600;
    focus: GameFocus = "earth";
    state: GameHud["state"] = "orbit";
    hits = 0;
    throws = 0;
    rocketsLanded = 0;
    event: GameEvent | null = null;

    private opts: SpaceGameOptions;
    private anchor = new THREE.Vector3();
    private earthVel = new THREE.Vector3();
    private pull = new THREE.Vector3();
    private spin = 0;
    private spinRate = 0;
    private stateTime = 0;
    private returnFrom = new THREE.Vector3();
    private eventId = 0;
    private shake = 0;

    private camYaw = 0;
    private camPitch = 0.42;
    private camDist = 120;
    private distGoal = 120;
    private camTarget = new THREE.Vector3();
    private camPos = new THREE.Vector3();
    private orbitDrag: {x: number; y: number} | null = null;

    private sun = new THREE.Group();
    private sunMat = sunMaterial();
    private sunGlow: THREE.Sprite;
    private sunHeat = 0;
    private planets: Array<{def: PlanetDef; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; pos: THREE.Vector3; label: THREE.Sprite}> = [];
    private moon: THREE.Mesh;
    private moonMat: THREE.ShaderMaterial;
    private moonPos = new THREE.Vector3();
    private moonLabel: THREE.Sprite;
    private earthLabel: THREE.Sprite;
    private flags = new THREE.Group();
    private orbitLines: THREE.LineLoop[] = [];
    private fadeMats: Array<{mat: THREE.Material & {opacity: number}; base: number}> = [];

    private aimLine: THREE.Line;
    private preview: THREE.Points;
    private trail: THREE.Line;
    private trailPts: THREE.Vector3[] = [];
    private shards: THREE.InstancedMesh;
    private shardData: Array<{pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; home: THREE.Vector3; scale: number}> = [];
    private shardOrigin = new THREE.Vector3();
    private flash: THREE.Mesh;
    private shock: THREE.Mesh;
    private rockets: Rocket[] = [];
    private raycaster = new THREE.Raycaster();
    private tmp = new THREE.Vector3();
    private tmp2 = new THREE.Vector3();
    private dummy = new THREE.Object3D();

    constructor(opts: SpaceGameOptions) {
        this.opts = opts;

        // Slunce
        const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), this.sunMat);
        this.sun.add(sunMesh);
        const glowMat = new THREE.SpriteMaterial({map: glowTexture("rgba(255,220,150,1)", "rgba(255,140,40,0.45)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false});
        this.sunGlow = new THREE.Sprite(glowMat);
        this.sunGlow.scale.setScalar(SUN_R * 7);
        this.sun.add(this.sunGlow);
        this.fadeMats.push({mat: glowMat, base: 1});
        const sunLabel = nameSprite(opts.names.sun, "#ffc76e");
        sunLabel.position.y = SUN_R;
        this.sun.add(sunLabel);
        this.fadeMats.push({mat: sunLabel.material, base: 1});
        this.group.add(this.sun);

        // planety + dráhy
        for (const def of PLANETS) {
            const mat = bodyMaterial(def.color, def.color2, def.bands, this.sunPos);
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 48, 32), mat);
            if (def.id === "saturn") {
                const ringMat = new THREE.MeshBasicMaterial({color: 0xd9c08f, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false});
                const ring = new THREE.Mesh(new THREE.RingGeometry(def.radius * 1.3, def.radius * 2.25, 96), ringMat);
                ring.rotation.x = Math.PI / 2 - 0.47;
                mesh.add(ring);
                this.fadeMats.push({mat: ringMat, base: 0.55});
            }
            const label = nameSprite(opts.names[def.id], "#9fd0ff");
            label.position.y = def.radius;
            mesh.add(label);
            this.fadeMats.push({mat: label.material, base: 1});
            this.group.add(mesh);
            this.planets.push({def, mesh, mat, pos: mesh.position, label});
        }
        const orbitMat = new THREE.LineBasicMaterial({color: 0x58a6ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false});
        this.fadeMats.push({mat: orbitMat, base: 0.22});
        for (const a of [...PLANETS.map((p) => p.a), 1]) {
            const pts = new THREE.EllipseCurve(0, 0, orbitRadius(a), orbitRadius(a)).getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y));
            const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat);
            this.orbitLines.push(loop);
            this.group.add(loop);
        }

        // Měsíc
        this.moonMat = bodyMaterial(0xd8d8d8, 0x6c6c72, 0, this.sunPos);
        this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 40, 28), this.moonMat);
        this.moonLabel = nameSprite(opts.names.moon, "#d7e6ff");
        this.moonLabel.position.y = MOON_R;
        this.moon.add(this.moonLabel);
        this.moon.add(this.flags);
        this.fadeMats.push({mat: this.moonLabel.material, base: 1});
        this.group.add(this.moon);
        this.earthLabel = nameSprite(opts.names.earth, "#6ef2c0");
        this.fadeMats.push({mat: this.earthLabel.material, base: 1});
        this.group.add(this.earthLabel);

        // míření: gumička + předpověď dráhy
        const aimMat = new THREE.LineBasicMaterial({color: 0xffb35c, transparent: true, opacity: 0.9, depthWrite: false});
        this.aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), aimMat);
        this.aimLine.frustumCulled = false;
        this.aimLine.visible = false;
        this.group.add(this.aimLine);
        const prevGeo = new THREE.BufferGeometry();
        prevGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(120 * 3), 3));
        this.preview = new THREE.Points(prevGeo, new THREE.PointsMaterial({color: 0x6ef2c0, size: 2.2, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending}));
        this.preview.frustumCulled = false;
        this.preview.visible = false;
        this.group.add(this.preview);

        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
        this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({color: 0x38d6ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false}));
        this.trail.frustumCulled = false;
        this.trail.visible = false;
        this.group.add(this.trail);

        // střepy Země
        const SHARDS = 260;
        this.shards = new THREE.InstancedMesh(
            new THREE.TetrahedronGeometry(1.5, 0),
            new THREE.MeshBasicMaterial({transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false}),
            SHARDS,
        );
        const palette = [0x38d6ff, 0x2f6bff, 0x6ef2c0, 0xffb35c, 0x8fdcff];
        const col = new THREE.Color();
        for (let i = 0; i < SHARDS; i++) {
            const u = Math.random() * 2 - 1;
            const th = Math.random() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            const dir = new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
            const home = dir.clone().multiplyScalar(R * (0.55 + Math.random() * 0.45));
            this.shardData.push({
                pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), home,
                spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8),
                scale: 0.5 + Math.random() * 1.1,
            });
            this.shards.setColorAt(i, col.setHex(palette[i % palette.length]));
        }
        this.shards.visible = false;
        this.shards.frustumCulled = false;
        this.group.add(this.shards);
        this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({color: 0xfff0d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false}));
        this.flash.visible = false;
        this.group.add(this.flash);
        this.shock = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 128), new THREE.MeshBasicMaterial({color: 0x8fdcff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false}));
        this.shock.rotation.x = -Math.PI / 2;
        this.shock.visible = false;
        this.group.add(this.shock);
    }

    /** start hry: Země zůstane v počátku, Slunce a planety se rozmístí kolem podle data */
    start(time = Date.now()) {
        this.simTime = time;
        const L = 100.46 + 0.9856 * days(time);
        this.sunPos.copy(helio(L, AU)).negate();
        this.anchor.set(0, 0, 0);
        this.earthPos.set(0, 0, 0);
        this.state = "orbit";
        this.earthVisible = true;
        this.earthScale = 1;
        this.focus = "earth";
        // kamera za Zemí, Slunce v pozadí kousek vedle
        const away = this.tmp.copy(this.earthPos).sub(this.sunPos).normalize();
        this.camYaw = Math.atan2(away.x, away.z) + 0.38;
        this.camPitch = 0.42;
        this.camDist = this.distGoal = 120;
        this.camTarget.copy(this.earthPos);
        this.layout(0);
    }

    hud(): GameHud {
        return {
            time: this.simTime, speed: this.speed, state: this.state,
            hits: this.hits, throws: this.throws, rockets: this.rocketsLanded, event: this.event,
        };
    }

    setSpeed(speed: number) {
        this.speed = speed;
    }

    setTime(ms: number) {
        this.simTime = ms;
    }

    setFocus(focus: GameFocus) {
        this.focus = focus;
        this.distGoal = focus === "earth" ? 120 : focus === "sun" ? 330 : 2300;
        if (focus === "system") this.camPitch = 0.95;
    }

    zoom(deltaY: number) {
        this.distGoal = THREE.MathUtils.clamp(this.distGoal * Math.exp(deltaY * 0.0012), 28, 4200);
    }

    /** kde se teď kurzor dotýká Země (pro kurzor "uchop") */
    overEarth(ndc: THREE.Vector2, camera: THREE.Camera): boolean {
        if (this.state !== "orbit") return false;
        this.raycaster.setFromCamera(ndc, camera);
        return this.raycaster.ray.intersectsSphere(new THREE.Sphere(this.earthPos, R * 1.5));
    }

    pointerDown(ndc: THREE.Vector2, camera: THREE.Camera, x: number, y: number) {
        if (this.overEarth(ndc, camera)) {
            this.state = "aim";
            this.stateTime = 0;
            this.pull.set(0, 0, 0);
            this.focus = "earth";
            return;
        }
        this.orbitDrag = {x, y};
    }

    pointerMove(ndc: THREE.Vector2, camera: THREE.Camera, x: number, y: number) {
        if (this.state === "aim") {
            // tah po rovině ekliptiky (rovina, kde leží Slunce i planety)
            this.raycaster.setFromCamera(ndc, camera);
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.anchor.y);
            const hit = this.raycaster.ray.intersectPlane(plane, this.tmp);
            if (hit) {
                this.pull.copy(this.anchor).sub(hit).setY(0);
                if (this.pull.length() > MAX_PULL) this.pull.setLength(MAX_PULL);
            }
            return;
        }
        if (this.orbitDrag) {
            const dx = x - this.orbitDrag.x;
            const dy = y - this.orbitDrag.y;
            this.orbitDrag = {x, y};
            this.camYaw -= dx * 0.005;
            this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.004, 0.12, 1.45);
        }
    }

    pointerUp() {
        this.orbitDrag = null;
        if (this.state !== "aim") return;
        if (this.pull.length() < 3) {
            this.state = "orbit";
            this.aimLine.visible = false;
            this.preview.visible = false;
            return;
        }
        this.earthVel.copy(this.pull).multiplyScalar(LAUNCH_K);
        this.spinRate = 4 + this.pull.length() * 0.35;
        this.state = "fly";
        this.stateTime = 0;
        this.throws++;
        this.trailPts = [];
        this.emit("throw");
        this.aimLine.visible = false;
        this.preview.visible = false;
    }

    launchRocket() {
        if (this.state !== "orbit" || this.rockets.filter((r) => !r.done).length >= 4) return;
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.6, 12), new THREE.MeshBasicMaterial({color: 0xe8f4ff}));
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 12), new THREE.MeshBasicMaterial({color: 0xff5c7a}));
        nose.position.y = 1.15;
        group.add(body, nose);
        for (let i = 0; i < 3; i++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.45), new THREE.MeshBasicMaterial({color: 0x38d6ff}));
            fin.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.32, -0.6, Math.sin((i / 3) * Math.PI * 2) * 0.32);
            fin.rotation.y = -(i / 3) * Math.PI * 2;
            group.add(fin);
        }
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.4, 10), new THREE.MeshBasicMaterial({color: 0xffb35c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false}));
        flame.rotation.x = Math.PI;
        flame.position.y = -1.5;
        group.add(flame);
        group.scale.setScalar(0.9);
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
        const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({color: 0xffd9a0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false}));
        trail.frustumCulled = false;
        this.group.add(group, trail);
        const start = this.opts.homeLocal.clone().multiplyScalar(R * 1.01).applyQuaternion(this.globeQuat);
        this.rockets.push({group, flame, trail, trailPts: [], start, t: 0, done: false});
    }

    /** pozice kamery, kam se dívá a "nahoru" */
    pose(): {pos: THREE.Vector3; target: THREE.Vector3} {
        return {pos: this.camPos, target: this.camTarget};
    }

    update(dt: number, mix: number) {
        this.simTime += this.speed * dt * 1000;
        this.stateTime += dt;
        this.layout(dt);
        this.updateEarth(dt);
        this.updateRockets(dt);
        this.updateCamera(dt);
        this.earthLabel.position.copy(this.earthPos).add(this.tmp.set(0, R * 1.25, 0));
        this.earthLabel.visible = this.earthVisible;

        this.sunMat.uniforms.uTime.value += dt;
        this.sunHeat *= Math.exp(-dt * 1.5);
        this.sunMat.uniforms.uHeat.value = this.sunHeat;
        this.sunGlow.scale.setScalar(SUN_R * (7 + this.sunHeat * 6));
        this.sunMat.uniforms.uOpacity.value = mix;
        this.planets.forEach((p) => (p.mat.uniforms.uOpacity.value = mix));
        this.moonMat.uniforms.uOpacity.value = mix;
        for (const f of this.fadeMats) f.mat.opacity = f.base * mix;
        this.group.visible = mix > 0.01;
    }

    /** Slunce, planety, Měsíc a "kotva" Země na dráze podle simulovaného času */
    private layout(dt: number) {
        const d = days(this.simTime);
        this.sun.position.copy(this.sunPos);
        for (const p of this.planets) {
            helio(p.def.L0 + p.def.rate * d, orbitRadius(p.def.a), p.pos).add(this.sunPos);
            p.mesh.rotation.y += dt * 0.3;
        }
        this.orbitLines.forEach((l) => l.position.copy(this.sunPos));
        helio(100.46 + 0.9856 * d, AU, this.anchor).add(this.sunPos);
        // Měsíc obíhá kotvu Země (ne letící Zemi)
        const moonL = 218.316 + 13.176396 * d;
        helio(moonL, MOON_DIST, this.moonPos).add(this.state === "orbit" || this.state === "aim" ? this.earthPos : this.anchor);
        this.moon.position.copy(this.moonPos);
        // Měsíc ukazuje k Zemi pořád stejnou stranu
        this.moon.rotation.y = moonL * DEG + Math.PI;
    }

    private updateEarth(dt: number) {
        const shardMat = this.shards.material as THREE.MeshBasicMaterial;
        switch (this.state) {
            case "orbit":
                this.earthPos.copy(this.anchor);
                this.spinRate *= Math.exp(-dt * 2);
                this.spin = this.spin % (Math.PI * 2);
                this.spin *= Math.exp(-dt * 1.5);
                break;
            case "aim": {
                this.earthPos.copy(this.anchor).addScaledVector(this.pull, -0.18);
                this.spin += dt * this.pull.length() * 0.3;
                const geo = this.aimLine.geometry as THREE.BufferGeometry;
                const arr = geo.getAttribute("position") as THREE.BufferAttribute;
                arr.setXYZ(0, this.anchor.x, this.anchor.y, this.anchor.z);
                arr.setXYZ(1, this.anchor.x - this.pull.x, this.anchor.y, this.anchor.z - this.pull.z);
                arr.needsUpdate = true;
                this.aimLine.visible = this.pull.length() > 1;
                this.updatePreview();
                break;
            }
            case "fly": {
                const steps = 6;
                const h = dt / steps;
                for (let i = 0; i < steps && this.state === "fly"; i++) {
                    const toSun = this.tmp.copy(this.sunPos).sub(this.earthPos);
                    const r = toSun.length();
                    this.earthVel.addScaledVector(toSun, (GM / (r * r * r)) * h);
                    this.earthPos.addScaledVector(this.earthVel, h);
                    this.checkCollisions();
                }
                this.spin += this.spinRate * dt;
                this.trailPts.push(this.earthPos.clone());
                if (this.trailPts.length > 160) this.trailPts.shift();
                this.writeLine(this.trail, this.trailPts);
                this.trail.visible = true;
                if (this.state === "fly" && (this.earthPos.distanceTo(this.sunPos) > AU * 9 || this.stateTime > 16)) {
                    this.emit("lost");
                    this.beginReturn();
                }
                break;
            }
            case "shattered": {
                const t = this.stateTime;
                shardMat.opacity = 1;
                const rewind = THREE.MathUtils.clamp((t - 2.8) / 1.6, 0, 1);
                const e = easeInOut(rewind);
                this.shardData.forEach((s, i) => {
                    if (t < 2.8) {
                        s.vel.multiplyScalar(Math.exp(-dt * 0.6));
                        s.pos.addScaledVector(s.vel, dt);
                    }
                    s.rot.x += s.spin.x * dt * (1 - e);
                    s.rot.y += s.spin.y * dt * (1 - e);
                    // zpětné převinutí: střepy se slétnou zpátky na dráhu Země
                    const p = this.tmp.copy(s.pos).lerp(this.tmp2.copy(this.anchor).add(s.home), e);
                    this.dummy.position.copy(p);
                    this.dummy.rotation.copy(s.rot);
                    this.dummy.scale.setScalar(s.scale * (1 - e * 0.6));
                    this.dummy.updateMatrix();
                    this.shards.setMatrixAt(i, this.dummy.matrix);
                });
                this.shards.instanceMatrix.needsUpdate = true;
                const fm = this.flash.material as THREE.MeshBasicMaterial;
                fm.opacity = Math.max(0, 1 - t * 1.4);
                this.flash.scale.setScalar(R * (1 + t * 3.5));
                const sm = this.shock.material as THREE.MeshBasicMaterial;
                sm.opacity = Math.max(0, 0.55 - t * 0.3);
                this.shock.scale.setScalar(R * (1 + t * 22));
                this.flash.visible = fm.opacity > 0;
                this.shock.visible = sm.opacity > 0;
                this.earthPos.copy(this.anchor);
                if (rewind >= 1) {
                    this.shards.visible = false;
                    this.earthVisible = true;
                    this.earthScale = 0.2;
                    this.state = "orbit";
                    this.stateTime = 0;
                    this.trail.visible = false;
                }
                break;
            }
            case "return": {
                const k = easeInOut(Math.min(this.stateTime / 1.6, 1));
                this.earthPos.lerpVectors(this.returnFrom, this.anchor, k);
                this.spin += this.spinRate * dt * (1 - k);
                if (k >= 1) {
                    this.state = "orbit";
                    this.trail.visible = false;
                }
                break;
            }
        }
        if (this.earthScale < 1) this.earthScale = Math.min(1, this.earthScale + dt * 2.2);
        this.shake *= Math.exp(-dt * 3);

        // natočení Země: bod pod Sluncem míří ke Slunci, sever nahoru
        this.sunDir.copy(this.sunPos).sub(this.earthPos).normalize();
        const ss = subsolar(this.simTime);
        const local = latLon(ss.lat, ss.lon);
        const basis = (a: THREE.Vector3, up: THREE.Vector3) => {
            const x = a.clone().normalize();
            const y = up.clone().addScaledVector(x, -x.dot(up)).normalize();
            const z = new THREE.Vector3().crossVectors(x, y);
            return new THREE.Matrix4().makeBasis(x, y, z);
        };
        const up = new THREE.Vector3(0, 1, 0);
        const m = basis(this.sunDir, up).multiply(basis(local, up).transpose());
        this.globeQuat.setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(up, this.spin));
    }

    private checkCollisions() {
        const p = this.earthPos;
        if (p.distanceTo(this.sunPos) < SUN_R + R * 0.7) {
            this.hits++;
            this.sunHeat = 1;
            this.shatter("hit", "sun");
            return;
        }
        for (const pl of this.planets) {
            if (p.distanceTo(pl.pos) < pl.def.radius + R * 0.8) {
                this.shatter("crash", pl.def.id);
                return;
            }
        }
        if (p.distanceTo(this.moonPos) < MOON_R + R * 0.8) this.shatter("crash", "moon");
    }

    private shatter(kind: GameEvent["kind"], target: GameTarget) {
        this.emit(kind, target);
        this.state = "shattered";
        this.stateTime = 0;
        this.earthVisible = false;
        this.shake = 1;
        this.shardOrigin.copy(this.earthPos);
        // výbuch ven + setrvačnost letu
        for (const s of this.shardData) {
            s.pos.copy(this.earthPos).add(s.home);
            s.vel.copy(s.home).normalize().multiplyScalar(25 + Math.random() * 70).addScaledVector(this.earthVel, 0.25);
            s.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        }
        this.shards.visible = true;
        this.flash.position.copy(this.earthPos);
        this.shock.position.copy(this.earthPos);
        this.flash.visible = true;
        this.shock.visible = true;
    }

    private beginReturn() {
        this.state = "return";
        this.stateTime = 0;
        this.returnFrom.copy(this.earthPos);
    }

    private emit(kind: GameEvent["kind"], target?: GameTarget) {
        this.event = {id: ++this.eventId, kind, target};
    }

    /** předpověď letu (jen gravitace Slunce), 6 s dopředu */
    private updatePreview() {
        const vis = this.pull.length() > 3;
        this.preview.visible = vis;
        if (!vis) return;
        const attr = this.preview.geometry.getAttribute("position") as THREE.BufferAttribute;
        const p = this.anchor.clone();
        const vel = this.pull.clone().multiplyScalar(LAUNCH_K);
        const h = 1 / 40;
        let n = 0;
        for (let i = 0; i < 240 && n < 120; i++) {
            const toSun = this.tmp.copy(this.sunPos).sub(p);
            const r = toSun.length();
            if (r < SUN_R) break;
            vel.addScaledVector(toSun, (GM / (r * r * r)) * h);
            p.addScaledVector(vel, h);
            if (i % 2 === 0) attr.setXYZ(n++, p.x, p.y, p.z);
        }
        attr.needsUpdate = true;
        this.preview.geometry.setDrawRange(0, n);
    }

    private writeLine(lineObj: THREE.Line, pts: THREE.Vector3[]) {
        const attr = lineObj.geometry.getAttribute("position") as THREE.BufferAttribute;
        pts.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
        attr.needsUpdate = true;
        lineObj.geometry.setDrawRange(0, pts.length);
    }

    private updateRockets(dt: number) {
        for (const r of this.rockets) {
            if (r.done) continue;
            r.t += dt;
            const k = Math.min(r.t / 5, 1);
            // dráha vůči Zemi: kolmo vzhůru z Olomouce, pak oblouk k Měsíci
            const moonRel = this.tmp.copy(this.moonPos).sub(this.earthPos);
            const p0 = r.start;
            const p1 = r.start.clone().setLength(R + 16);
            const p3 = moonRel.clone().sub(moonRel.clone().normalize().multiplyScalar(MOON_R + 0.6));
            const p2 = p3.clone().lerp(p1, 0.45).add(new THREE.Vector3(0, 10, 0));
            const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            const pos = curve.getPoint(e).add(this.earthPos);
            const tan = curve.getTangent(Math.min(e + 0.001, 1));
            r.group.position.copy(pos);
            r.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
            r.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
            r.trailPts.push(pos.clone());
            if (r.trailPts.length > 60) r.trailPts.shift();
            this.writeLine(r.trail, r.trailPts);
            if (k >= 1) {
                r.done = true;
                this.rocketsLanded++;
                this.emit("rocket", "moon");
                this.group.remove(r.group, r.trail);
                disposeObject(r.group);
                disposeObject(r.trail);
                // vlajka na místě přistání
                const flag = new THREE.Group();
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), new THREE.MeshBasicMaterial({color: 0xffffff}));
                pole.position.y = 0.5;
                const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), new THREE.MeshBasicMaterial({color: 0x6ef2c0, side: THREE.DoubleSide}));
                cloth.position.set(0.3, 0.82, 0);
                flag.add(pole, cloth);
                const local = this.moon.worldToLocal(pos.clone()).normalize();
                flag.position.copy(local).multiplyScalar(MOON_R);
                flag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
                this.flags.add(flag);
            }
        }
        this.rockets = this.rockets.filter((r) => !r.done);
    }

    private updateCamera(dt: number) {
        this.camDist += (this.distGoal - this.camDist) * (1 - Math.exp(-dt * 3));
        const goal = this.focus === "earth"
            ? (this.state === "shattered" ? this.shardOrigin.clone().lerp(this.anchor, THREE.MathUtils.clamp((this.stateTime - 2.8) / 1.6, 0, 1)) : this.earthPos)
            : this.sunPos;
        this.camTarget.lerp(goal, 1 - Math.exp(-dt * (this.state === "fly" ? 8 : 4)));
        const cp = Math.cos(this.camPitch);
        this.camPos.set(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp)
            .multiplyScalar(this.camDist).add(this.camTarget);
        if (this.shake > 0.01) {
            const s = this.shake * 2.5;
            this.camPos.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
        }
    }

    dispose() {
        for (const r of this.rockets) {
            disposeObject(r.group);
            disposeObject(r.trail);
        }
        disposeObject(this.group);
    }
}

function disposeObject(root: THREE.Object3D) {
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as (THREE.Material & {map?: THREE.Texture | null}) | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else {
            mat?.map?.dispose();
            mat?.dispose();
        }
    });
}
