import * as THREE from "three";

/**
 * 3D město z OpenStreetMap (public/places/olomouc.json, viz scripts/build-city.mjs):
 * budovy se svítícími okny, silnice, voda, zeleň a vyznačená místa z CV
 * (škola, práce). Kamera umí kroužit nad místem nebo jet za autem —
 * autem se dá projet celé okolí (WASD / šipky, kolize s budovami).
 *
 * 1 jednotka = 1 metr, x = východ, z = jih.
 */

export interface CityData {
    attribution: string;
    center: [number, number];
    places: Record<string, {x: number; z: number; b: number}>;
    b: number[][];
    r: number[][];
    w: number[][];
    v: number[][];
    g: number[][];
    t: number[][];
}

export interface CityHud {
    driving: boolean;
    speed: number;
    place: string;
    target: string | null;
    targetDist: number;
    arrived: number;
}

export interface CityOptions {
    placeNames: Record<string, string>;
}

/** delta decimetry → absolutní metry */
function decode(p: number[], from = 0): Float32Array {
    const out = new Float32Array(p.length - from);
    let x = 0;
    let z = 0;
    for (let i = from, k = 0; i < p.length; i += 2, k += 2) {
        x += p[i];
        z += p[i + 1];
        out[k] = x / 10;
        out[k + 1] = z / 10;
    }
    return out;
}

/** body polygonu bez zdvojeného posledního bodu, CCW */
function ring(pts: Float32Array): THREE.Vector2[] {
    const r: THREE.Vector2[] = [];
    for (let i = 0; i < pts.length; i += 2) r.push(new THREE.Vector2(pts[i], pts[i + 1]));
    if (r.length > 1 && r[0].distanceTo(r[r.length - 1]) < 0.01) r.pop();
    if (THREE.ShapeUtils.isClockWise(r)) r.reverse();
    return r;
}

function pointInPoly(x: number, z: number, p: Float32Array): boolean {
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
}

const FOG = /* glsl */ `
vec3 applyFog(vec3 col, float dist) {
    float f = 1.0 - exp(-dist * 0.0013);
    return mix(col, vec3(0.008, 0.025, 0.06), f);
}
`;

function buildingMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {uTime: {value: 0}},
        vertexShader: /* glsl */ `
            attribute float aU;
            attribute float aSeed;
            attribute float aTarget;
            varying vec3 vW;
            varying float vU;
            varying float vSeed;
            varying float vTarget;
            void main() {
                vec4 w = modelMatrix * vec4(position, 1.0);
                vW = w.xyz;
                vU = aU;
                vSeed = aSeed;
                vTarget = aTarget;
                gl_Position = projectionMatrix * viewMatrix * w;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uTime;
            varying vec3 vW;
            varying float vU;
            varying float vSeed;
            varying float vTarget;
            ${FOG}
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            void main() {
                float dist = length(vW - cameraPosition);
                vec3 col = mix(vec3(0.025, 0.06, 0.13), vec3(0.06, 0.15, 0.3), clamp(vW.y / 45.0, 0.0, 1.0));
                if (vU < -0.5) {
                    // střecha
                    col = vec3(0.035, 0.085, 0.17);
                } else {
                    vec2 cell = vec2(floor(vU / 3.2), floor((vW.y - 0.8) / 3.2));
                    vec2 f = vec2(fract(vU / 3.2), fract((vW.y - 0.8) / 3.2));
                    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78) * step(0.8, vW.y);
                    float lit = step(0.52, hash(cell + vSeed * 17.0));
                    vec3 warm = mix(vec3(1.0, 0.76, 0.42), vec3(0.55, 0.85, 1.0), step(0.6, hash(cell.yx + vSeed)));
                    float far = smoothstep(250.0, 700.0, dist);
                    vec3 windows = win * (lit * warm * 0.95 + (1.0 - lit) * vec3(0.05, 0.12, 0.24));
                    col += mix(windows, vec3(0.16, 0.16, 0.18) * 0.6, far);
                    // podlaží
                    col += vec3(0.1, 0.3, 0.6) * (1.0 - smoothstep(0.0, 0.05, f.y)) * 0.25 * (1.0 - far);
                }
                if (vTarget > 0.5) {
                    float pulse = 0.6 + 0.4 * sin(uTime * 3.0);
                    float scan = smoothstep(0.0, 0.5, sin(vW.y * 0.6 - uTime * 4.0));
                    col = mix(col, vec3(0.25, 0.95, 0.72) * (0.55 + 0.35 * scan), 0.55) + vec3(0.1, 0.35, 0.25) * pulse * 0.4;
                }
                gl_FragColor = vec4(applyFog(col, dist), 1.0);
            }
        `,
    });
}

function flatMaterial(color: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {uColor: {value: color}},
        vertexShader: /* glsl */ `
            varying vec3 vW;
            void main() {
                vec4 w = modelMatrix * vec4(position, 1.0);
                vW = w.xyz;
                gl_Position = projectionMatrix * viewMatrix * w;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            varying vec3 vW;
            ${FOG}
            void main() {
                gl_FragColor = vec4(applyFog(uColor, length(vW - cameraPosition)), 1.0);
            }
        `,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
}

function roadMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
            attribute vec2 aRoad; // (vzdálenost podél, -1..1 napříč)
            attribute float aWidth;
            varying vec2 vRoad;
            varying float vWidth;
            varying vec3 vW;
            void main() {
                vRoad = aRoad;
                vWidth = aWidth;
                vec4 w = modelMatrix * vec4(position, 1.0);
                vW = w.xyz;
                gl_Position = projectionMatrix * viewMatrix * w;
            }
        `,
        fragmentShader: /* glsl */ `
            varying vec2 vRoad;
            varying float vWidth;
            varying vec3 vW;
            ${FOG}
            void main() {
                vec3 col = vec3(0.05, 0.075, 0.12);
                float across = abs(vRoad.y);
                col += vec3(0.15, 0.55, 0.9) * smoothstep(0.86, 0.97, across) * 0.55;
                float dash = step(0.5, fract(vRoad.x / 6.0)) * (1.0 - smoothstep(0.02, 0.06, across)) * step(7.5, vWidth);
                col += vec3(0.9, 0.85, 0.6) * dash * 0.5;
                gl_FragColor = vec4(applyFog(col, length(vW - cameraPosition)), 1.0);
            }
        `,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    });
}

function groundMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
            varying vec3 vW;
            void main() {
                vec4 w = modelMatrix * vec4(position, 1.0);
                vW = w.xyz;
                gl_Position = projectionMatrix * viewMatrix * w;
            }
        `,
        fragmentShader: /* glsl */ `
            varying vec3 vW;
            ${FOG}
            float grid(float v, float s) {
                float d = abs(fract(v / s - 0.5) - 0.5) * s;
                float w = fwidth(v) * 1.2;
                return 1.0 - smoothstep(0.0, max(w, 1e-4), d);
            }
            void main() {
                vec3 col = vec3(0.012, 0.03, 0.06);
                float g = max(grid(vW.x, 20.0), grid(vW.z, 20.0)) * 0.25 + max(grid(vW.x, 100.0), grid(vW.z, 100.0)) * 0.5;
                col += vec3(0.1, 0.35, 0.7) * g * 0.35;
                gl_FragColor = vec4(applyFog(col, length(vW - cameraPosition)), 1.0);
            }
        `,
    });
}

function nameSprite(text: string, color: string, size = 0.026): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = "700 40px 'JetBrains Mono', ui-monospace, monospace";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    canvas.width = w;
    canvas.height = 64;
    ctx.font = font;
    ctx.fillStyle = "rgba(2, 10, 24, 0.78)";
    ctx.fillRect(0, 0, w, 64);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, 61);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthTest: false, sizeAttenuation: false}));
    sprite.scale.set((size * w) / 64, size, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 10;
    return sprite;
}

function buildCar(): {group: THREE.Group; wheels: THREE.Mesh[]; brake: THREE.MeshBasicMaterial} {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), new THREE.MeshBasicMaterial({color: 0x14325e}));
    body.position.y = 0.62;
    const bodyEdges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({color: 0x38d6ff}));
    bodyEdges.position.copy(body.position);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), new THREE.MeshBasicMaterial({color: 0x123a6e}));
    cabin.position.set(0, 1.18, 0.25);
    const cabinEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cabin.geometry), new THREE.LineBasicMaterial({color: 0x8fdcff}));
    cabinEdges.position.copy(cabin.position);
    group.add(body, bodyEdges, cabin, cabinEdges);
    // přední světla + kužel světla (auto jede směrem -z)
    const headMat = new THREE.MeshBasicMaterial({color: 0xfff3d0});
    const brake = new THREE.MeshBasicMaterial({color: 0x801020});
    for (const x of [-0.65, 0.65]) {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.05), headMat);
        head.position.set(x, 0.7, -2.16);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.05), brake);
        tail.position.set(x, 0.72, 2.16);
        group.add(head, tail);
    }
    // světlo reflektorů na silnici
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32, Math.PI * 0.32, Math.PI * 0.36), new THREE.MeshBasicMaterial({
        color: 0xffe2a8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.scale.setScalar(18);
    pool.position.set(0, 0.12, -1.5);
    group.add(pool);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3, 5.4), new THREE.MeshBasicMaterial({color: 0x38d6ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false}));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.08;
    group.add(glow);
    const wheels: THREE.Mesh[] = [];
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshBasicMaterial({color: 0x050a12});
    for (const [x, z] of [[-0.95, -1.35], [0.95, -1.35], [-0.95, 1.4], [0.95, 1.4]]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(x, 0.38, z);
        const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.39, 0.39, 0.31, 6).rotateZ(Math.PI / 2)), new THREE.LineBasicMaterial({color: 0x58a6ff}));
        w.add(rim);
        group.add(w);
        wheels.push(w);
    }
    return {group, wheels, brake};
}

export class City {
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 5000);
    driving = false;

    private data: CityData;
    private polys: Float32Array[] = [];
    private grid = new Map<string, number[]>();
    private buildingMat = buildingMaterial();
    private markers: Array<{id: string; group: THREE.Group; ring: THREE.Mesh}> = [];
    private place = "";
    private target: string | null = null;
    private arrived = 0;

    private car: ReturnType<typeof buildCar>;
    private carPos = new THREE.Vector2();
    private heading = 0;
    private speed = 0;
    private steer = 0;
    private keys = new Set<string>();
    private touch = {throttle: 0, steer: 0};
    private arrow: THREE.Group;

    private orbitYaw = 0.6;
    private orbitPitch = 0.62;
    private orbitDist = 260;
    private orbitTarget = new THREE.Vector3();
    private orbitGoal = new THREE.Vector3();
    private intro = 1;
    private drag: {x: number; y: number} | null = null;
    private time = 0;
    private camVel = new THREE.Vector3();

    constructor(data: CityData, private opts: CityOptions) {
        this.data = data;
        this.scene.background = new THREE.Color(0x020812);
        this.buildGround();
        this.buildAreas();
        this.buildRoads();
        this.buildBuildings();
        this.buildMarkers();
        this.car = buildCar();
        this.car.group.visible = false;
        this.scene.add(this.car.group);

        // navigační šipka nad autem
        this.arrow = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 4), new THREE.MeshBasicMaterial({color: 0x6ef2c0, transparent: true, opacity: 0.9}));
        cone.rotation.x = -Math.PI / 2;
        this.arrow.add(cone);
        this.arrow.visible = false;
        this.scene.add(this.arrow);

        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
    }

    /** přelet nad místo; intro = sestup z výšky (po příletu ze Země) */
    focus(id: string, intro = false) {
        const p = this.data.places[id];
        if (!p) return;
        this.place = id;
        this.orbitGoal.set(p.x / 10, 0, p.z / 10);
        if (intro) {
            this.orbitTarget.copy(this.orbitGoal);
            this.intro = 0;
            this.orbitDist = 260;
            this.orbitPitch = 0.62;
        }
        if (this.driving) this.setTarget(id);
    }

    setDriving(on: boolean) {
        if (on === this.driving) return;
        this.driving = on;
        this.car.group.visible = on;
        this.keys.clear();
        if (on) {
            this.spawnCar(this.place);
            this.target = null;
        } else {
            this.orbitGoal.set(this.carPos.x, 0, this.carPos.y);
            this.arrow.visible = false;
        }
    }

    /** cíl navigace při jízdě */
    setTarget(id: string | null) {
        this.target = id && id !== this.nearestPlace() ? id : null;
    }

    setTouch(throttle: number, steer: number) {
        this.touch.throttle = throttle;
        this.touch.steer = steer;
    }

    resize(w: number, h: number) {
        this.camera.aspect = w / h;
        this.camera.fov = w / h < 0.9 ? 68 : 55;
        this.camera.updateProjectionMatrix();
    }

    pointerDown(x: number, y: number) {
        this.drag = {x, y};
    }

    pointerMove(x: number, y: number) {
        if (!this.drag) return;
        const dx = x - this.drag.x;
        const dy = y - this.drag.y;
        this.drag = {x, y};
        this.orbitYaw -= dx * 0.005;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.004, 0.12, 1.4);
    }

    pointerUp() {
        this.drag = null;
    }

    zoom(deltaY: number) {
        this.orbitDist = THREE.MathUtils.clamp(this.orbitDist * Math.exp(deltaY * 0.0012), 25, 1400);
    }

    hud(): CityHud {
        let targetDist = 0;
        if (this.target) {
            const p = this.data.places[this.target];
            targetDist = Math.hypot(p.x / 10 - this.carPos.x, p.z / 10 - this.carPos.y);
        }
        return {driving: this.driving, speed: Math.abs(this.speed) * 3.6, place: this.place, target: this.target, targetDist, arrived: this.arrived};
    }

    update(dt: number) {
        this.time += dt;
        this.buildingMat.uniforms.uTime.value = this.time;
        this.markers.forEach((m, i) => {
            const k = (this.time * 0.6 + i * 0.25) % 1;
            m.ring.scale.setScalar(1 + k * 3);
            (m.ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
            m.group.children[0].scale.y = 0.85 + Math.sin(this.time * 2 + i) * 0.15;
        });
        if (this.driving) {
            this.drive(dt);
            this.chaseCamera(dt);
        } else {
            this.orbitCamera(dt);
        }
    }

    private nearestPlace(): string {
        let best = this.place;
        let bestD = Infinity;
        for (const [id, p] of Object.entries(this.data.places)) {
            const d = Math.hypot(p.x / 10 - this.carPos.x, p.z / 10 - this.carPos.y);
            if (d < bestD) {
                bestD = d;
                best = id;
            }
        }
        return best;
    }

    private onKeyDown = (e: KeyboardEvent) => {
        if (!this.driving) return;
        const k = e.key.toLowerCase();
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "].includes(k)) {
            e.preventDefault();
            this.keys.add(k);
        }
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.key.toLowerCase());
    };

    private drive(dt: number) {
        const k = this.keys;
        const throttle = THREE.MathUtils.clamp((k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) + this.touch.throttle, -1, 1);
        const steerIn = THREE.MathUtils.clamp((k.has("a") || k.has("arrowleft") ? 1 : 0) - (k.has("d") || k.has("arrowright") ? 1 : 0) + this.touch.steer, -1, 1);
        const handbrake = k.has(" ");

        if (throttle > 0) this.speed += (this.speed < 0 ? 30 : 13) * dt;
        else if (throttle < 0) this.speed -= (this.speed > 0 ? 30 : 8) * dt;
        else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
        if (handbrake) this.speed *= Math.exp(-dt * 3);
        this.speed -= this.speed * 0.12 * dt;
        this.speed = THREE.MathUtils.clamp(this.speed, -10, 36);

        const maxSteer = 0.6 * (1 - Math.min(Math.abs(this.speed) / 55, 0.55));
        this.steer += (steerIn * maxSteer - this.steer) * Math.min(dt * 6, 1);
        this.heading += (this.speed / 2.7) * Math.tan(this.steer) * dt * (handbrake ? 1.5 : 1);

        const fx = -Math.sin(this.heading);
        const fz = -Math.cos(this.heading);
        const nx = this.carPos.x + fx * this.speed * dt;
        const nz = this.carPos.y + fz * this.speed * dt;
        // kolize: přední a zadní roh auta nesmí do budovy
        const front = this.hitsBuilding(nx + fx * 2, nz + fz * 2) || this.hitsBuilding(nx - fx * 2, nz - fz * 2);
        if (front) {
            this.speed *= -0.3;
        } else {
            this.carPos.set(nx, nz);
        }

        const g = this.car.group;
        g.position.set(this.carPos.x, 0, this.carPos.y);
        g.rotation.y = this.heading;
        // náklon v zatáčce
        g.rotation.z = THREE.MathUtils.clamp(-this.steer * this.speed * 0.01, -0.08, 0.08);
        this.car.wheels.forEach((w, i) => {
            w.rotation.x -= (this.speed / 0.38) * dt;
            if (i < 2) w.rotation.y = this.steer;
        });
        this.car.brake.color.setHex(throttle < 0 || handbrake ? 0xff2244 : 0x801020);

        // navigace
        if (this.target) {
            const p = this.data.places[this.target];
            const tx = p.x / 10;
            const tz = p.z / 10;
            const d = Math.hypot(tx - this.carPos.x, tz - this.carPos.y);
            this.arrow.visible = true;
            this.arrow.position.set(this.carPos.x, 4.2 + Math.sin(this.time * 3) * 0.2, this.carPos.y);
            this.arrow.rotation.y = Math.atan2(-(tx - this.carPos.x), -(tz - this.carPos.y));
            if (d < 45) {
                this.place = this.target;
                this.target = null;
                this.arrived++;
            }
        } else {
            this.arrow.visible = false;
        }
    }

    private hitsBuilding(x: number, z: number): boolean {
        const cell = this.grid.get(`${Math.floor(x / 50)},${Math.floor(z / 50)}`);
        if (!cell) return false;
        return cell.some((i) => pointInPoly(x, z, this.polys[i]));
    }

    private spawnCar(id: string) {
        const p = this.data.places[id] ?? Object.values(this.data.places)[0];
        const px = p.x / 10;
        const pz = p.z / 10;
        // nejbližší bod silnice k místu, směr podél silnice
        let best = {d: Infinity, x: px, z: pz, h: 0};
        for (const r of this.data.r) {
            if (r[0] < 5) continue;
            const pts = decode(r, 1);
            for (let i = 0; i + 3 < pts.length; i += 2) {
                const d = Math.hypot(pts[i] - px, pts[i + 1] - pz);
                if (d < best.d && !this.hitsBuilding(pts[i], pts[i + 1])) {
                    best = {d, x: pts[i], z: pts[i + 1], h: Math.atan2(-(pts[i + 2] - pts[i]), -(pts[i + 3] - pts[i + 1]))};
                }
            }
        }
        this.carPos.set(best.x, best.z);
        this.heading = best.h;
        this.speed = 0;
        this.steer = 0;
        this.camVel.set(0, 0, 0);
    }

    private orbitCamera(dt: number) {
        if (this.intro < 1) this.intro = Math.min(1, this.intro + dt / 2.6);
        const e = 1 - Math.pow(1 - this.intro, 3);
        if (!this.drag) this.orbitYaw += dt * 0.06;
        this.orbitTarget.lerp(this.orbitGoal, 1 - Math.exp(-dt * 2.5));
        const dist = THREE.MathUtils.lerp(1800, this.orbitDist, e);
        const pitch = THREE.MathUtils.lerp(1.45, this.orbitPitch, e);
        const cp = Math.cos(pitch);
        this.camera.position.set(Math.sin(this.orbitYaw) * cp, Math.sin(pitch), Math.cos(this.orbitYaw) * cp)
            .multiplyScalar(dist).add(this.orbitTarget);
        this.camera.lookAt(this.orbitTarget.x, 8, this.orbitTarget.z);
    }

    private chaseCamera(dt: number) {
        const fx = -Math.sin(this.heading);
        const fz = -Math.cos(this.heading);
        const back = 9 + Math.abs(this.speed) * 0.12;
        let dist = back;
        // kamera nesmí do zdi: zkrátí se a zvedne, když je za autem budova
        for (let d = 2; d <= back; d += 1) {
            if (this.hitsBuilding(this.carPos.x - fx * d, this.carPos.y - fz * d)) {
                dist = Math.max(d - 1.5, 3);
                break;
            }
        }
        const lift = (back - dist) * 0.6;
        const goal = new THREE.Vector3(this.carPos.x - fx * dist, 3.6 + lift + Math.abs(this.speed) * 0.03, this.carPos.y - fz * dist);
        this.camera.position.lerp(goal, 1 - Math.exp(-dt * 6));
        this.camera.lookAt(this.carPos.x + fx * 6, 1.2, this.carPos.y + fz * 6);
    }

    // --- stavba scény ---

    private bounds() {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const r of this.data.r) {
            const pts = decode(r, 1);
            for (let i = 0; i < pts.length; i += 2) {
                minX = Math.min(minX, pts[i]);
                maxX = Math.max(maxX, pts[i]);
                minZ = Math.min(minZ, pts[i + 1]);
                maxZ = Math.max(maxZ, pts[i + 1]);
            }
        }
        return {minX, maxX, minZ, maxZ};
    }

    private buildGround() {
        const b = this.bounds();
        const w = b.maxX - b.minX + 3000;
        const h = b.maxZ - b.minZ + 3000;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, h), groundMaterial());
        ground.rotation.x = -Math.PI / 2;
        ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
        this.scene.add(ground);
    }

    private polygonMesh(list: number[][], color: number, y: number) {
        const pos: number[] = [];
        for (const p of list) {
            const r = ring(decode(p));
            if (r.length < 3) continue;
            const tris = THREE.ShapeUtils.triangulateShape(r, []);
            for (const t of tris) for (const i of t) pos.push(r[i].x, y, r[i].y);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        this.scene.add(new THREE.Mesh(geo, flatMaterial(new THREE.Color(color))));
    }

    private buildAreas() {
        this.polygonMesh(this.data.g, 0x06261c, 0.02);
        this.polygonMesh(this.data.w, 0x07254d, 0.03);
        // řeky jako pás
        this.ribbons(this.data.v, flatMaterial(new THREE.Color(0x07254d)), 0.03);
        const rail: number[] = [];
        for (const t of this.data.t) {
            const pts = decode(t);
            for (let i = 0; i + 3 < pts.length; i += 2) rail.push(pts[i], 0.1, pts[i + 1], pts[i + 2], 0.1, pts[i + 3]);
        }
        const railGeo = new THREE.BufferGeometry();
        railGeo.setAttribute("position", new THREE.Float32BufferAttribute(rail, 3));
        this.scene.add(new THREE.LineSegments(railGeo, new THREE.LineBasicMaterial({color: 0x7a6cff, transparent: true, opacity: 0.6})));
    }

    private ribbons(list: number[][], material: THREE.Material, y: number) {
        const pos: number[] = [];
        const road: number[] = [];
        const width: number[] = [];
        for (const r of list) {
            const w = r[0];
            const pts = decode(r, 1);
            let along = 0;
            for (let i = 0; i + 3 < pts.length; i += 2) {
                const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
                const len = Math.hypot(bx - ax, bz - az);
                if (len < 0.01) continue;
                // přesah na koncích, ať nejsou v zatáčkách díry
                const ux = (bx - ax) / len;
                const uz = (bz - az) / len;
                const ext = w * 0.45;
                const sx = ax - ux * ext, sz = az - uz * ext, ex = bx + ux * ext, ez = bz + uz * ext;
                const nx = -uz * w / 2;
                const nz = ux * w / 2;
                const a0 = along - ext;
                const a1 = along + len + ext;
                const quad = [
                    [sx + nx, sz + nz, a0, -1], [sx - nx, sz - nz, a0, 1], [ex + nx, ez + nz, a1, -1],
                    [ex + nx, ez + nz, a1, -1], [sx - nx, sz - nz, a0, 1], [ex - nx, ez - nz, a1, 1],
                ];
                for (const [x, z, al, ac] of quad) {
                    pos.push(x, y, z);
                    road.push(al, ac);
                    width.push(w);
                }
                along += len;
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("aRoad", new THREE.Float32BufferAttribute(road, 2));
        geo.setAttribute("aWidth", new THREE.Float32BufferAttribute(width, 1));
        this.scene.add(new THREE.Mesh(geo, material));
    }

    private buildRoads() {
        // širší silnice navrch
        const sorted = this.data.r.slice().sort((a, b) => a[0] - b[0]);
        this.ribbons(sorted, roadMaterial(), 0.05);
    }

    private buildBuildings() {
        const targets = new Set(Object.values(this.data.places).map((p) => p.b));
        const pos: number[] = [];
        const us: number[] = [];
        const seeds: number[] = [];
        const tgt: number[] = [];
        const outline: number[] = [];
        this.data.b.forEach((b, bi) => {
            const h = b[0] / 10;
            const pts = decode(b, 1);
            this.polys.push(pts);
            const r = ring(pts);
            if (r.length < 3) return;
            const seed = (bi * 0.6180339) % 1;
            const isTarget = targets.has(bi) ? 1 : 0;
            // spatial grid pro kolize
            const cells = new Set<string>();
            for (const p of r) cells.add(`${Math.floor(p.x / 50)},${Math.floor(p.y / 50)}`);
            cells.forEach((c) => {
                const list = this.grid.get(c);
                if (list) list.push(bi);
                else this.grid.set(c, [bi]);
            });
            let u = 0;
            for (let i = 0; i < r.length; i++) {
                const a = r[i];
                const c = r[(i + 1) % r.length];
                const len = a.distanceTo(c);
                const quad = [[a, 0, u], [c, 0, u + len], [c, h, u + len], [a, 0, u], [c, h, u + len], [a, h, u]] as const;
                for (const [p, y, uu] of quad) {
                    pos.push(p.x, y, p.y);
                    us.push(uu);
                    seeds.push(seed);
                    tgt.push(isTarget);
                }
                outline.push(a.x, h, a.y, c.x, h, c.y);
                u += len;
            }
            const tris = THREE.ShapeUtils.triangulateShape(r, []);
            for (const t of tris) {
                for (const i of t) {
                    pos.push(r[i].x, h, r[i].y);
                    us.push(-1);
                    seeds.push(seed);
                    tgt.push(isTarget);
                }
            }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("aU", new THREE.Float32BufferAttribute(us, 1));
        geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
        geo.setAttribute("aTarget", new THREE.Float32BufferAttribute(tgt, 1));
        const mesh = new THREE.Mesh(geo, this.buildingMat);
        this.scene.add(mesh);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(outline, 3));
        this.scene.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({color: 0x38d6ff, transparent: true, opacity: 0.55})));
    }

    private buildMarkers() {
        for (const [id, p] of Object.entries(this.data.places)) {
            const group = new THREE.Group();
            const b = this.data.b[p.b];
            const h = b ? b[0] / 10 : 10;
            group.position.set(p.x / 10, 0, p.z / 10);
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.4, 420, 16, 1, true), new THREE.MeshBasicMaterial({
                color: 0x6ef2c0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
            }));
            beam.position.y = 210;
            group.add(beam);
            const ringMesh = new THREE.Mesh(new THREE.RingGeometry(14, 15.5, 64), new THREE.MeshBasicMaterial({
                color: 0x6ef2c0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
            }));
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.y = 0.3;
            group.add(ringMesh);
            const label = nameSprite(this.opts.placeNames[id] ?? id, "#6ef2c0");
            label.position.y = h + 12;
            group.add(label);
            this.scene.add(group);
            this.markers.push({id, group, ring: ringMesh});
        }
    }

    dispose() {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        this.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            mesh.geometry?.dispose();
            const mat = mesh.material as (THREE.Material & {map?: THREE.Texture | null}) | undefined;
            mat?.map?.dispose();
            mat?.dispose();
        });
    }
}
