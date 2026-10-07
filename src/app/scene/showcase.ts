import * as THREE from "three";

/**
 * 3D "hologramy" projektů — po kliknutí na projekt se místo textu ukáže,
 * co projekt dělá. Každý builder vrací skupinu a update(t), kde t = čas od
 * otevření (s); prvky se postupně "sestaví" podle userData.delay.
 */

export interface Showcase {
    group: THREE.Group;
    update: (t: number, dt: number) => void;
    dispose: () => void;
}

const CYAN = 0x38d6ff;
const BLUE = 0x58a6ff;
const DEEP = 0x2f6bff;
const MINT = 0x6ef2c0;
const RED = 0xff5c7a;

const additive = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

const lineMat = (color: number, opacity = 0.6) => new THREE.LineBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

function edges(geometry: THREE.BufferGeometry, color = CYAN, opacity = 0.9): THREE.LineSegments {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMat(color, opacity));
}

function line(points: THREE.Vector3[], color = CYAN, opacity = 0.35): THREE.Line {
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat(color, opacity));
}

/** textový štítek jako sprite (canvas textura) */
function label(text: string, color = "#38d6ff", size = 1): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = "600 44px 'JetBrains Mono', ui-monospace, monospace";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 48;
    canvas.width = w;
    canvas.height = 76;
    ctx.font = font;
    ctx.fillStyle = "rgba(2, 10, 24, 0.78)";
    ctx.fillRect(0, 0, w, 76);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, 73);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 24, 40);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
    const h = 0.62 * size;
    sprite.scale.set((h * w) / 76, h, 1);
    return sprite;
}

/** malý "terminál" s řádky textu */
function terminal(lines: string[]): THREE.Mesh {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(2, 12, 28, 0.9)";
    ctx.fillRect(0, 0, 384, 240);
    ctx.strokeStyle = "#38d6ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 380, 236);
    ctx.font = "26px 'JetBrains Mono', ui-monospace, monospace";
    lines.forEach((l, i) => {
        ctx.fillStyle = l.startsWith("✓") ? "#6ef2c0" : i === 0 ? "#38d6ff" : "#bfe6ff";
        ctx.fillText(l, 18, 46 + i * 44);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    }));
}

const easeOutBack = (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** postupné sestavení: objekt vyroste od delay po dobu 0.7 s */
function assemble(objects: THREE.Object3D[], t: number) {
    for (const o of objects) {
        const k = THREE.MathUtils.clamp((t - (o.userData.delay ?? 0)) / 0.7, 0, 1);
        const base: THREE.Vector3 = o.userData.baseScale ?? (o.userData.baseScale = o.scale.clone());
        o.scale.copy(base).multiplyScalar(Math.max(k === 0 ? 0 : easeOutBack(k), 0.0001));
        o.visible = k > 0;
    }
}

function withDelay<T extends THREE.Object3D>(o: T, delay: number): T {
    o.userData.delay = delay;
    o.userData.baseScale = o.scale.clone();
    o.scale.setScalar(0.0001);
    return o;
}

function disposeGroup(group: THREE.Group) {
    group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as (THREE.Material & {map?: THREE.Texture | null}) | undefined;
        mat?.map?.dispose();
        mat?.dispose();
    });
}

// --- WorkMux: AI jádro řídí izolované Docker session s Claude Code ---
function workmux(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];

    const core = new THREE.Group();
    core.add(edges(new THREE.IcosahedronGeometry(1.3, 1), CYAN, 0.9));
    core.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16), additive(BLUE, 0.55)));
    group.add(withDelay(core, 0));
    parts.push(core);
    const coreLabel = withDelay(label(labels[0] ?? "AI"), 0.3);
    coreLabel.position.set(0, 2.2, 0);
    group.add(coreLabel);
    parts.push(coreLabel);

    const sessions: THREE.Group[] = [];
    const packets: Array<{mesh: THREE.Mesh; target: THREE.Vector3; phase: number}> = [];
    const termLines = [
        ["$ claude", "> fix flaky test", "✓ 42 passed"],
        ["$ docker run", "> session #2", "✓ isolated"],
        ["$ claude", "> refactor api", "✓ PR ready"],
        ["$ npm run e2e", "> playwright", "✓ green"],
    ];
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const pos = new THREE.Vector3(Math.cos(a) * 5.2, (i % 2 ? -0.6 : 0.6), Math.sin(a) * 5.2);
        const s = new THREE.Group();
        s.position.copy(pos);
        s.add(edges(new THREE.BoxGeometry(2, 1.4, 1.4), BLUE, 0.85));
        const term = terminal(termLines[i]);
        term.position.set(0, 1.45, 0);
        s.add(term);
        group.add(withDelay(s, 0.35 + i * 0.18));
        parts.push(s);
        sessions.push(s);

        const link = withDelay(line([new THREE.Vector3(), pos], CYAN, 0.3), 0.3 + i * 0.18);
        group.add(link);
        parts.push(link);
        for (let k = 0; k < 2; k++) {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), additive(k ? MINT : CYAN, 1));
            group.add(mesh);
            packets.push({mesh, target: pos, phase: k * 0.5 + i * 0.13});
        }
    }
    const sessLabel = withDelay(label(labels[1] ?? "Docker", "#58a6ff", 0.85), 1.2);
    sessLabel.position.copy(sessions[0].position).add(new THREE.Vector3(0, -1.4, 0));
    group.add(sessLabel);
    parts.push(sessLabel);
    const agentLabel = withDelay(label(labels[2] ?? "mTLS", "#6ef2c0", 0.8), 1.4);
    agentLabel.position.copy(sessions[2].position).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.7, 0));
    group.add(agentLabel);
    parts.push(agentLabel);

    return {
        group,
        update(t) {
            assemble(parts, t);
            core.rotation.y = t * 0.6;
            core.rotation.x = t * 0.25;
            sessions.forEach((s, i) => {
                s.position.y = (i % 2 ? -0.6 : 0.6) + Math.sin(t * 1.2 + i) * 0.15;
            });
            for (const p of packets) {
                const k = (t * 0.45 + p.phase) % 1;
                // tam a zpět: úkol do session, výsledek zpět do jádra
                const f = k < 0.5 ? k * 2 : 2 - k * 2;
                p.mesh.position.copy(p.target).multiplyScalar(f);
                p.mesh.visible = t > 1.2;
            }
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Ironbean: DI kontejner "vstřikuje" závislosti do služeb a komponent ---
function ironbean(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];

    const container = new THREE.Group();
    container.position.set(0, 3.2, 0);
    container.add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 48), additive(CYAN, 0.9)));
    container.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), additive(BLUE, 0.6)));
    container.add(edges(new THREE.OctahedronGeometry(0.9), CYAN, 0.6));
    group.add(withDelay(container, 0));
    parts.push(container);
    const cLabel = withDelay(label(labels[0] ?? "Container"), 0.25);
    cLabel.position.set(0, 4.8, 0);
    group.add(cLabel);
    parts.push(cLabel);

    const services: THREE.Vector3[] = [];
    const comps: THREE.Vector3[] = [];
    const edgesList: Array<[THREE.Vector3, THREE.Vector3, number]> = [];
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(a) * 3.6, 0, Math.sin(a) * 3.6);
        services.push(p);
        const node = edges(new THREE.OctahedronGeometry(0.6), BLUE, 0.95);
        node.position.copy(p);
        group.add(withDelay(node, 0.4 + i * 0.15));
        parts.push(node);
        const l = withDelay(line([container.position, p], CYAN, 0.35), 0.35 + i * 0.15);
        group.add(l);
        parts.push(l);
        edgesList.push([container.position, p, i * 0.33]);
    }
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const p = new THREE.Vector3(Math.cos(a) * 5.6, -3, Math.sin(a) * 5.6);
        comps.push(p);
        const node = edges(new THREE.BoxGeometry(0.8, 0.8, 0.8), MINT, 0.9);
        node.position.copy(p);
        group.add(withDelay(node, 0.9 + i * 0.1));
        parts.push(node);
        const from = services[Math.floor(i / 2)];
        const l = withDelay(line([from, p], BLUE, 0.3), 0.85 + i * 0.1);
        group.add(l);
        parts.push(l);
        edgesList.push([from, p, 0.5 + i * 0.12]);
    }
    const sLabel = withDelay(label(labels[1] ?? "Service", "#58a6ff", 0.8), 1);
    sLabel.position.copy(services[0]).add(new THREE.Vector3(0, 1.1, 0));
    group.add(sLabel);
    parts.push(sLabel);
    const kLabel = withDelay(label(labels[2] ?? "Component", "#6ef2c0", 0.8), 1.5);
    kLabel.position.copy(comps[1]).add(new THREE.Vector3(0, -1.1, 0));
    group.add(kLabel);
    parts.push(kLabel);

    const pulses = edgesList.map(([a, b, phase]) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), additive(CYAN, 1));
        group.add(m);
        return {m, a, b, phase};
    });

    return {
        group,
        update(t) {
            assemble(parts, t);
            container.rotation.y = t * 0.8;
            for (const p of pulses) {
                const k = (t * 0.5 + p.phase) % 1;
                p.m.position.lerpVectors(p.a, p.b, k);
                p.m.visible = t > 1.6;
            }
        },
        dispose: () => disposeGroup(group),
    };
}

// --- ArmyGame: hexová mapa, jednotky dvou hráčů, server posílá WebSocket ticky ---
function armygame(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const hexR = 0.62;
    const tiles: THREE.Vector3[] = [];
    const hexGeo = new THREE.CylinderGeometry(hexR * 0.96, hexR * 0.96, 1, 6);
    for (let q = -4; q <= 4; q++) {
        for (let r = -4; r <= 4; r++) {
            if (Math.abs(q + r) > 4) continue;
            const x = hexR * Math.sqrt(3) * (q + r / 2);
            const z = hexR * 1.5 * r;
            const h = 0.15 + (Math.sin(q * 1.3 + r * 0.7) * 0.5 + 0.5) * 0.6;
            const tile = edges(hexGeo, (q + r) % 3 === 0 ? BLUE : DEEP, 0.55);
            tile.scale.set(1, h, 1);
            tile.position.set(x, h / 2 - 1.2, z);
            const dist = Math.sqrt(x * x + z * z);
            group.add(withDelay(tile, dist * 0.08));
            parts.push(tile);
            tiles.push(new THREE.Vector3(x, h - 1.2, z));
        }
    }

    const tower = new THREE.Group();
    tower.add(edges(new THREE.CylinderGeometry(0.25, 0.5, 2.4, 6), CYAN, 1));
    tower.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), additive(CYAN, 0.9)));
    tower.children[1].position.y = 1.3;
    tower.position.y = 0;
    group.add(withDelay(tower, 0.6));
    parts.push(tower);
    const rings = [0, 1, 2].map(() => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 64), additive(CYAN, 0.8));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.2;
        group.add(ring);
        return ring;
    });

    const units = [0, 1, 2, 3, 4, 5].map((i) => {
        const enemy = i >= 3;
        const u = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), additive(enemy ? RED : MINT, 0.95));
        group.add(u);
        const from = tiles[(i * 11) % tiles.length];
        const to = tiles[(i * 17 + 23) % tiles.length];
        return {u, from, to, phase: i * 0.37};
    });

    const l1 = withDelay(label(labels[0] ?? "WebSocket"), 1);
    l1.position.set(0, 2.6, 0);
    const l2 = withDelay(label(labels[1] ?? "WebGL", "#58a6ff", 0.85), 1.3);
    l2.position.set(-4.6, 0.4, 2.4);
    const l3 = withDelay(label(labels[2] ?? "Multiplayer", "#6ef2c0", 0.85), 1.6);
    l3.position.set(4.4, 0.6, -2);
    group.add(l1, l2, l3);
    parts.push(l1, l2, l3);

    return {
        group,
        update(t) {
            assemble(parts, t);
            rings.forEach((ring, i) => {
                const k = (t * 0.5 + i / 3) % 1;
                ring.scale.setScalar(0.5 + k * 6);
                (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7 * (t > 0.9 ? 1 : 0);
            });
            for (const u of units) {
                const k = (Math.sin(t * 0.6 + u.phase * 5) * 0.5 + 0.5);
                u.u.position.lerpVectors(u.from, u.to, k);
                u.u.position.y += 0.35 + Math.abs(Math.sin(t * 6 + u.phase)) * 0.08;
                u.u.visible = t > 1.1;
            }
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Worldee: cestovatelská platforma — lety mezi městy kolem glóbu ---
function worldee(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const R = 3.4;
    const globe = new THREE.Group();
    globe.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R, 24, 16)), lineMat(DEEP, 0.35)));
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, 32, 24), additive(0x0a2a55, 0.35)));
    group.add(withDelay(globe, 0));
    parts.push(globe);

    const toVec = (lat: number, lon: number, r = R) => {
        const phi = THREE.MathUtils.degToRad(lat);
        const lam = THREE.MathUtils.degToRad(lon);
        return new THREE.Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
    };
    // Praha, New York, Tokio, Kapské Město, Rio, Sydney, Reykjavík, Dubaj
    const cities = [[50, 14.4], [40.7, -74], [35.7, 139.7], [-33.9, 18.4], [-22.9, -43.2], [-33.9, 151.2], [64.1, -21.9], [25.2, 55.3]];
    const pins = cities.map(([lat, lon], i) => {
        const p = toVec(lat, lon);
        const pin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), additive(i === 0 ? MINT : CYAN, 1));
        pin.position.copy(p);
        globe.add(withDelay(pin, 0.3 + i * 0.06));
        parts.push(pin);
        return p;
    });
    const routes = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [0, 6], [0, 7], [7, 5]].map(([a, b], i) => {
        const pa = pins[a];
        const pb = pins[b];
        const mid = pa.clone().add(pb).multiplyScalar(0.5);
        mid.setLength(R + pa.distanceTo(pb) * 0.35);
        const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
        const arc = withDelay(line(curve.getPoints(48), BLUE, 0.4), 0.6 + i * 0.1);
        globe.add(arc);
        parts.push(arc);
        const plane = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), additive(CYAN, 1));
        globe.add(plane);
        return {curve, plane, phase: i * 0.21};
    });

    const l1 = withDelay(label(labels[0] ?? "Flights"), 1);
    l1.position.set(0, R + 1.6, 0);
    const l2 = withDelay(label(labels[1] ?? "Cars", "#58a6ff", 0.85), 1.3);
    l2.position.set(-R - 1.8, -0.6, 0.8);
    const l3 = withDelay(label(labels[2] ?? "Journal", "#6ef2c0", 0.85), 1.6);
    l3.position.set(R + 1.6, 0.8, -0.6);
    group.add(l1, l2, l3);
    parts.push(l1, l2, l3);

    const tangent = new THREE.Vector3();
    return {
        group,
        update(t) {
            assemble(parts, t);
            globe.rotation.y = t * 0.15;
            for (const r of routes) {
                const k = (t * 0.25 + r.phase) % 1;
                r.curve.getPoint(k, r.plane.position);
                r.curve.getTangent(k, tangent);
                r.plane.lookAt(r.plane.position.clone().add(tangent));
                r.plane.rotateX(Math.PI / 2);
                r.plane.visible = t > 1.2;
            }
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Quadient: dokumenty projíždí pipeline šablona → data → výstup ---
function quadient(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const gates = [-4, 0, 4].map((x, i) => {
        const g = new THREE.Group();
        g.position.x = x;
        g.add(edges(new THREE.BoxGeometry(0.3, 3, 3), i === 2 ? MINT : CYAN, 0.9));
        g.add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), additive(i === 2 ? MINT : CYAN, 0.06)));
        g.children[1].rotation.y = Math.PI / 2;
        group.add(withDelay(g, i * 0.25));
        parts.push(g);
        const l = withDelay(label(labels[i] ?? `#${i}`, i === 2 ? "#6ef2c0" : "#38d6ff", 0.85), 0.5 + i * 0.25);
        l.position.set(x, 2.3, 0);
        group.add(l);
        parts.push(l);
        return x;
    });
    const rail = withDelay(line([new THREE.Vector3(-8, -1.6, 0), new THREE.Vector3(8, -1.6, 0)], BLUE, 0.35), 0.2);
    group.add(rail);
    parts.push(rail);

    const docs = Array.from({length: 9}, (_, i) => {
        const doc = new THREE.Group();
        const sheet = edges(new THREE.BoxGeometry(0.05, 1.5, 1.1), CYAN, 0.9);
        const fill = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.45, 1.05), additive(CYAN, 0.12));
        doc.add(sheet, fill);
        // "řádky textu" na dokumentu
        for (let r = 0; r < 4; r++) {
            const ln = line([new THREE.Vector3(0.04, 0.45 - r * 0.25, -0.4), new THREE.Vector3(0.04, 0.45 - r * 0.25, 0.4 - (r % 2) * 0.25)], BLUE, 0.7);
            doc.add(ln);
        }
        group.add(doc);
        return {doc, fill, phase: i / 9};
    });

    return {
        group,
        update(t) {
            assemble(parts, t);
            for (const d of docs) {
                const k = (t * 0.12 + d.phase) % 1;
                const x = -8 + k * 16;
                d.doc.position.set(x, -0.2 + Math.sin(k * Math.PI * 4) * 0.12, Math.sin(d.phase * 20) * 0.6);
                d.doc.rotation.y = Math.sin(t + d.phase * 10) * 0.25;
                // za každou bránou dokument "zesvětlá"
                const stage = gates.filter((g) => x > g).length;
                const mat = d.fill.material as THREE.MeshBasicMaterial;
                mat.color.setHex(stage >= 3 ? MINT : stage >= 1 ? BLUE : CYAN);
                mat.opacity = 0.08 + stage * 0.08;
                d.doc.visible = t > 1;
            }
        },
        dispose: () => disposeGroup(group),
    };
}

const ORANGE = 0xffb35c;

/** deterministické "náhodné" číslo, ať hologram vypadá pokaždé stejně */
function seeded(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** tři štítky na zadaných místech, postupně naskočí */
function placeLabels(group: THREE.Group, parts: THREE.Object3D[], labels: string[], at: THREE.Vector3[], start = 1) {
    const colors = ["#38d6ff", "#58a6ff", "#6ef2c0"];
    at.forEach((pos, i) => {
        if (!labels[i]) return;
        const l = withDelay(label(labels[i], colors[i % 3], i === 0 ? 1 : 0.85), start + i * 0.3);
        l.position.copy(pos);
        group.add(l);
        parts.push(l);
    });
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- OverCup: realtime portál 1v1 deskovek, stav partií v Redisu ---
function overcup(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const rnd = seeded(7);

    // herní deska 8×8 (reversi)
    const cell = 0.82;
    const board = new THREE.Group();
    board.position.y = -2;
    const tileGeo = new THREE.BoxGeometry(cell * 0.94, 0.08, cell * 0.94);
    const discGeo = new THREE.CylinderGeometry(cell * 0.36, cell * 0.36, 0.1, 20);
    const discs: Array<{m: THREE.Mesh; flipAt: number; white: boolean}> = [];
    for (let x = 0; x < 8; x++) {
        for (let z = 0; z < 8; z++) {
            const px = (x - 3.5) * cell;
            const pz = (z - 3.5) * cell;
            const tile = edges(tileGeo, (x + z) % 2 ? DEEP : BLUE, 0.5);
            tile.position.set(px, 0, pz);
            board.add(withDelay(tile, Math.hypot(x - 3.5, z - 3.5) * 0.06));
            parts.push(tile);
            if (rnd() < 0.45) {
                const white = rnd() < 0.5;
                const m = new THREE.Mesh(discGeo, additive(white ? MINT : RED, 0.85));
                m.position.set(px, 0.15, pz);
                board.add(withDelay(m, 0.5 + rnd() * 0.6));
                parts.push(m);
                discs.push({m, flipAt: rnd() * 6, white});
            }
        }
    }
    group.add(board);

    // server: socket.io uzly + Redis se stavem partie
    const server = new THREE.Group();
    server.position.set(0, 2.8, 0);
    for (let i = 0; i < 3; i++) {
        const b = edges(new THREE.BoxGeometry(1.6, 0.42, 1.1), i === 1 ? RED : CYAN, 0.9);
        b.position.y = i * 0.55;
        server.add(b);
    }
    server.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), additive(RED, 0.5)));
    group.add(withDelay(server, 0.3));
    parts.push(server);

    // dva hráči na protějších stranách
    const players = [v(-6.4, 0.6, 0), v(6.4, 0.6, 0)].map((p, i) => {
        const g = new THREE.Group();
        g.position.copy(p);
        g.add(edges(new THREE.IcosahedronGeometry(0.7, 0), i ? RED : MINT, 1));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), additive(i ? RED : MINT, 0.6)));
        group.add(withDelay(g, 0.7 + i * 0.2));
        parts.push(g);
        const l = withDelay(line([p, server.position], CYAN, 0.35), 0.8 + i * 0.2);
        group.add(l);
        parts.push(l);
        return g;
    });
    const packets = [0, 1, 2, 3].map((i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), additive(i % 2 ? RED : MINT, 1));
        group.add(m);
        return {m, from: i % 2, phase: i * 0.25};
    });

    // další hry obíhají kolem: go, hex, karty, kostka, šachy, čtyři v řadě
    const minis: THREE.Object3D[] = [];
    const goGrid = new THREE.GridHelper(1.4, 6, CYAN, CYAN);
    const hex = edges(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 6), BLUE);
    const card = edges(new THREE.BoxGeometry(0.75, 1.1, 0.04), MINT);
    const dice = edges(new THREE.BoxGeometry(0.75, 0.75, 0.75), CYAN);
    const king = edges(new THREE.ConeGeometry(0.4, 1.1, 8), ORANGE);
    const c4 = edges(new THREE.BoxGeometry(1.2, 1, 0.2), BLUE);
    [goGrid, hex, card, dice, king, c4].forEach((o, i) => {
        const pivot = new THREE.Group();
        pivot.rotation.y = (i / 6) * Math.PI * 2;
        o.position.set(7.6, 0.4 + (i % 2) * 1.2, 0);
        pivot.add(o);
        group.add(withDelay(pivot, 1 + i * 0.1));
        parts.push(pivot);
        minis.push(pivot);
    });

    placeLabels(group, parts, labels, [v(0, 4.9, 0), v(0, -3.3, 3.8), v(-6.4, 1.9, 0)], 1.1);

    return {
        group,
        update(t) {
            assemble(parts, t);
            server.rotation.y = t * 0.5;
            players.forEach((p, i) => {
                p.rotation.y = t * (i ? -1 : 1);
                p.position.y = 0.6 + Math.sin(t * 1.4 + i * 2) * 0.2;
            });
            for (const p of packets) {
                const k = (t * 0.55 + p.phase) % 1;
                // tah: hráč → server → soupeř
                const a = players[p.from].position;
                const b = players[1 - p.from].position;
                if (k < 0.5) p.m.position.lerpVectors(a, server.position, k * 2);
                else p.m.position.lerpVectors(server.position, b, k * 2 - 1);
                p.m.visible = t > 1.3;
            }
            // kameny se otáčí jako v reversi
            for (const d of discs) {
                const k = THREE.MathUtils.clamp(((t - 1.5 - d.flipAt) % 6) / 0.5, 0, 1);
                d.m.rotation.x = k * Math.PI;
                d.m.position.y = 0.15 + Math.sin(k * Math.PI) * 0.6;
                if (k > 0.5) (d.m.material as THREE.MeshBasicMaterial).color.setHex(d.white ? RED : MINT);
                else (d.m.material as THREE.MeshBasicMaterial).color.setHex(d.white ? MINT : RED);
            }
            minis.forEach((m, i) => {
                m.rotation.y = (i / 6) * Math.PI * 2 + t * 0.25;
                m.children[0].rotation.y = t;
            });
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Stack: backend — request propadne vrstvami PHP/Nette a vrátí se ---
function stackBackend(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const layersY = [3, 1.2, -0.6, -2.4];
    const slabs = layersY.map((y, i) => {
        const g = new THREE.Group();
        g.position.y = y;
        g.add(edges(new THREE.BoxGeometry(6 - i * 0.4, 0.35, 4 - i * 0.3), i === 3 ? MINT : i % 2 ? BLUE : CYAN, 0.9));
        const fill = new THREE.Mesh(new THREE.BoxGeometry(5.9 - i * 0.4, 0.3, 3.9 - i * 0.3), additive(i === 3 ? MINT : CYAN, 0.05));
        g.add(fill);
        group.add(withDelay(g, i * 0.18));
        parts.push(g);
        return fill;
    });
    // PHPStan: štít, který kontroluje každou vrstvu
    const shield = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.04, 6, 96), additive(ORANGE, 0.7));
    shield.rotation.x = Math.PI / 2;
    group.add(withDelay(shield, 0.9));
    parts.push(shield);

    const reqs = Array.from({length: 7}, (_, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), additive(CYAN, 1));
        group.add(m);
        return {m, phase: i / 7, x: Math.cos(i * 2.4) * 2.2, z: Math.sin(i * 2.4) * 1.3};
    });

    placeLabels(group, parts, labels, [v(0, 4.4, 0), v(3.8, 1.2, 0), v(-4.6, -0.4, 0)]);

    return {
        group,
        update(t) {
            assemble(parts, t);
            shield.position.y = Math.sin(t * 0.9) * 2.8;
            slabs.forEach((s) => ((s.material as THREE.MeshBasicMaterial).opacity *= 0.92));
            for (const r of reqs) {
                const k = (t * 0.3 + r.phase) % 1;
                // dolů k databázi a zpátky nahoru jako odpověď
                const y = k < 0.5 ? 5 - k * 2 * 7.4 : -2.4 + (k - 0.5) * 2 * 7.4;
                r.m.position.set(k < 0.5 ? r.x : -r.x, y, r.z);
                (r.m.material as THREE.MeshBasicMaterial).color.setHex(k < 0.5 ? CYAN : MINT);
                r.m.visible = t > 0.9;
                layersY.forEach((ly, i) => {
                    if (Math.abs(ly - y) < 0.25 && r.m.visible) {
                        const mat = slabs[i].material as THREE.MeshBasicMaterial;
                        mat.opacity = Math.max(mat.opacity, 0.3);
                    }
                });
            }
            slabs.forEach((s) => {
                const mat = s.material as THREE.MeshBasicMaterial;
                mat.opacity = Math.max(mat.opacity, 0.05);
            });
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Stack: frontend — React strom komponent, MobX store překreslí jen to, co se změnilo ---
function stackFrontend(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];

    const atom = new THREE.Group();
    atom.position.set(0, 3.6, 0);
    atom.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), additive(CYAN, 1)));
    for (let i = 0; i < 3; i++) {
        const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.035, 6, 72), additive(CYAN, 0.8));
        orbit.scale.set(1, 0.38, 1);
        orbit.rotation.z = (i / 3) * Math.PI;
        atom.add(orbit);
    }
    group.add(withDelay(atom, 0));
    parts.push(atom);

    // strom: 1 → 3 → 6
    const levels = [[v(0, 1.4, 0)], [v(-3, -0.4, 0), v(0, -0.4, 0.6), v(3, -0.4, 0)], []] as THREE.Vector3[][];
    levels[1].forEach((p) => {
        levels[2].push(p.clone().add(v(-0.9, -1.9, 0.4)), p.clone().add(v(0.9, -1.9, -0.4)));
    });
    const nodes: Array<{fill: THREE.Mesh; pos: THREE.Vector3}> = [];
    levels.forEach((lvl, d) => lvl.forEach((p, i) => {
        const g = new THREE.Group();
        g.position.copy(p);
        const size = 1.1 - d * 0.18;
        g.add(edges(new THREE.BoxGeometry(size * 1.5, size, size * 0.3), d === 0 ? CYAN : BLUE, 0.9));
        const fill = new THREE.Mesh(new THREE.BoxGeometry(size * 1.45, size * 0.95, size * 0.25), additive(MINT, 0));
        g.add(fill);
        group.add(withDelay(g, 0.3 + d * 0.25 + i * 0.05));
        parts.push(g);
        nodes.push({fill, pos: p});
        const parent = d === 0 ? atom.position : d === 1 ? levels[0][0] : levels[1][Math.floor(i / 2)];
        const l = withDelay(line([parent, p], CYAN, 0.3), 0.3 + d * 0.25);
        group.add(l);
        parts.push(l);
    }));

    // MobX store vlevo; observable změna doletí jen ke komponentám, které ji čtou
    const store = new THREE.Group();
    store.position.set(-6.4, 1.2, 0);
    store.add(edges(new THREE.OctahedronGeometry(0.8), MINT, 1));
    store.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), additive(MINT, 0.6)));
    group.add(withDelay(store, 0.9));
    parts.push(store);
    const sparks = [0, 1].map(() => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), additive(MINT, 1));
        group.add(m);
        return m;
    });

    placeLabels(group, parts, labels, [v(0, 5.4, 0), v(-6.4, 2.6, 0), v(4.8, 1.6, 0)]);

    let target = [4, 7];
    let cycle = -1;
    return {
        group,
        update(t) {
            assemble(parts, t);
            atom.rotation.y = t * 0.9;
            atom.rotation.x = Math.sin(t * 0.5) * 0.3;
            store.rotation.y = t;
            const c = Math.floor(t / 1.6);
            const k = (t % 1.6) / 1.6;
            if (c !== cycle) {
                cycle = c;
                target = [4 + (c * 3) % 6, 4 + (c * 5 + 2) % 6];
            }
            sparks.forEach((s, i) => {
                s.visible = t > 1.4 && k < 0.6;
                s.position.lerpVectors(store.position, nodes[target[i]].pos, Math.min(k / 0.6, 1));
            });
            nodes.forEach((n, i) => {
                const mat = n.fill.material as THREE.MeshBasicMaterial;
                const hit = target.includes(i) && k >= 0.6;
                mat.opacity = hit ? 0.55 * (1 - (k - 0.6) / 0.4) : mat.opacity * 0.9;
            });
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Stack: jazyky — tři jazyky sypou kód do společného jádra ---
function stackLang(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const core = new THREE.Group();
    core.add(edges(new THREE.DodecahedronGeometry(1.3), CYAN, 1));
    core.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 14), additive(BLUE, 0.6)));
    group.add(withDelay(core, 0));
    parts.push(core);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.6, 8), additive(CYAN, 0.6));
    beam.position.y = 2.6;
    group.add(withDelay(beam, 0.6));
    parts.push(beam);

    const colors = [DEEP, ORANGE, BLUE];
    const shapes = [new THREE.OctahedronGeometry(0.9), new THREE.TetrahedronGeometry(1.1), new THREE.BoxGeometry(1.2, 1.2, 1.2)];
    const langs = shapes.map((geo, i) => {
        const pivot = new THREE.Group();
        pivot.rotation.y = (i / 3) * Math.PI * 2;
        const body = new THREE.Group();
        body.position.set(5.2, 0, 0);
        body.add(edges(geo, colors[i], 1));
        body.add(new THREE.Mesh(geo, additive(colors[i], 0.15)));
        pivot.add(body);
        group.add(withDelay(pivot, 0.3 + i * 0.2));
        parts.push(pivot);
        return {pivot, body};
    });
    const bits = Array.from({length: 18}, (_, i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), additive(colors[i % 3], 1));
        group.add(m);
        return {m, lang: i % 3, phase: Math.floor(i / 3) / 6};
    });
    const lp = langs.map(() => new THREE.Vector3());
    langs.forEach(({body}, i) => {
        if (!labels[i]) return;
        const l = withDelay(label(labels[i], ["#58a6ff", "#ffb35c", "#38d6ff"][i], 0.85), 1 + i * 0.25);
        l.position.set(0, 1.5, 0);
        body.add(l);
        parts.push(l);
    });

    return {
        group,
        update(t) {
            assemble(parts, t);
            core.rotation.y = t * 0.7;
            core.rotation.z = t * 0.3;
            langs.forEach((l, i) => {
                l.pivot.rotation.y = (i / 3) * Math.PI * 2 + t * 0.3;
                l.body.rotation.x = t * (0.6 + i * 0.2);
                l.body.getWorldPosition(lp[i]);
                group.worldToLocal(lp[i]);
            });
            for (const b of bits) {
                const k = (t * 0.6 + b.phase) % 1;
                b.m.position.lerpVectors(lp[b.lang], core.position, k);
                b.m.rotation.set(t * 3, t * 2, 0);
                b.m.visible = t > 1;
            }
            (beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 6) * 0.25;
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Stack: AI — neuronová síť, signál projde vrstvami až do terminálu ---
function stackAi(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const layout = [4, 6, 6, 3];
    const layers = layout.map((n, li) => Array.from({length: n}, (_, i) => v((li - 1.5) * 3.2, (i - (n - 1) / 2) * 1.25, Math.sin(i + li) * 0.8)));
    const nodeMats: THREE.MeshBasicMaterial[][] = [];
    layers.forEach((layer, li) => {
        nodeMats.push([]);
        layer.forEach((p, i) => {
            const mat = additive(li === 3 ? MINT : CYAN, 0.35);
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), mat);
            m.position.copy(p);
            group.add(withDelay(m, li * 0.25 + i * 0.04));
            parts.push(m);
            nodeMats[li].push(mat);
        });
    });
    const conn: Array<[THREE.Vector3, THREE.Vector3, number]> = [];
    for (let li = 0; li < layers.length - 1; li++) {
        const pts: THREE.Vector3[] = [];
        layers[li].forEach((a) => layers[li + 1].forEach((b) => {
            pts.push(a, b);
            conn.push([a, b, li]);
        }));
        const seg = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(BLUE, 0.16));
        group.add(withDelay(seg, 0.4 + li * 0.25));
        parts.push(seg);
    }
    const term = terminal(["$ claude", "> mcp: tools ok", "✓ diff ready"]);
    term.scale.setScalar(1.7);
    term.position.set(8.2, 0, 0);
    group.add(withDelay(term, 1.2));
    parts.push(term);
    const rnd = seeded(3);
    const sig = conn.filter(() => rnd() < 0.3).map(([a, b, li]) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), additive(MINT, 1));
        group.add(m);
        return {m, a, b, li};
    });

    placeLabels(group, parts, labels, [v(-4.8, 3.6, 0), v(1.6, 4.6, 0), v(8.2, 1.8, 0)]);

    return {
        group,
        update(t) {
            assemble(parts, t);
            // vlna jde vrstvu po vrstvě, cyklus 3 s
            const wave = ((t - 1) % 3) / 0.75;
            for (const s of sig) {
                const k = wave - s.li;
                s.m.visible = t > 1 && k >= 0 && k <= 1;
                s.m.position.lerpVectors(s.a, s.b, THREE.MathUtils.clamp(k, 0, 1));
            }
            nodeMats.forEach((layer, li) => layer.forEach((m) => {
                const near = 1 - Math.min(Math.abs(wave - li), 1);
                m.opacity = 0.3 + near * 0.7;
            }));
            term.lookAt(term.position.clone().add(v(-1, 0, 2)));
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Stack: infra — kontejnery padají do clusteru, CI pipeline svítí krok po kroku ---
function stackInfra(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const deck = new THREE.GridHelper(8, 8, CYAN, DEEP);
    (deck.material as THREE.Material).transparent = true;
    (deck.material as THREE.Material).opacity = 0.5;
    deck.position.y = -2.4;
    group.add(withDelay(deck, 0));
    parts.push(deck);

    const boxGeo = new THREE.BoxGeometry(1.7, 0.85, 0.85);
    const slots = Array.from({length: 18}, (_, i) => v(((i % 3) - 1) * 1.9, -1.95 + Math.floor(i / 9) * 0.9, ((Math.floor(i / 3) % 3) - 1) * 1));
    const crates = slots.map((s, i) => {
        const c = new THREE.Group();
        c.add(edges(boxGeo, [CYAN, BLUE, MINT][i % 3], 0.95));
        c.add(new THREE.Mesh(boxGeo, additive([CYAN, BLUE, MINT][i % 3], 0.08)));
        group.add(c);
        return {c, s, at: 0.3 + i * 0.32};
    });

    // GitHub Actions: prstenec se 4 kroky build → test → e2e → deploy
    const ring = new THREE.Group();
    ring.position.y = 3.6;
    const stepMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const mat = additive(CYAN, 0.25);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), mat);
        m.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
        ring.add(m, edges(new THREE.OctahedronGeometry(0.6), BLUE, 0.7).translateX(m.position.x).translateZ(m.position.z));
        stepMats.push(mat);
    }
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.03, 6, 80), additive(BLUE, 0.6)).rotateX(Math.PI / 2));
    group.add(withDelay(ring, 0.5));
    parts.push(ring);

    // Terraform: drátěný "cloud" se sám postaví
    const cloud = new THREE.Group();
    cloud.position.set(-6.2, 1, 0);
    [[0, 0, 0, 1.1], [0.9, 0.3, 0, 0.8], [-0.9, 0.2, 0.2, 0.75], [0.2, 0.8, -0.2, 0.7]].forEach(([x, y, z, r]) => {
        const s = edges(new THREE.IcosahedronGeometry(r, 1), 0x9b8cff, 0.7);
        s.position.set(x, y, z);
        cloud.add(s);
    });
    group.add(withDelay(cloud, 0.8));
    parts.push(cloud);

    placeLabels(group, parts, labels, [v(0, -3.3, 3.2), v(-6.2, 2.8, 0), v(0, 5, 0)]);

    return {
        group,
        update(t) {
            assemble(parts, t);
            for (const c of crates) {
                const k = THREE.MathUtils.clamp((t - c.at) / 0.6, 0, 1);
                c.c.visible = k > 0;
                // pád shora s malým odskokem
                const fall = 1 - Math.pow(1 - k, 3);
                c.c.position.set(c.s.x, c.s.y + (1 - fall) * 7, c.s.z);
            }
            ring.rotation.y = t * 0.4;
            const step = Math.floor(t * 1.2) % 5;
            stepMats.forEach((m, i) => {
                m.color.setHex(i < step ? MINT : CYAN);
                m.opacity = i < step ? 0.9 : i === step ? 0.4 + Math.sin(t * 10) * 0.3 : 0.2;
            });
            cloud.rotation.y = t * 0.3;
        },
        dispose: () => disposeGroup(group),
    };
}

// --- Stack: data — SQL databáze, Redis cache nahoře, ScyllaDB kruh s replikací ---
function stackDb(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const disk = (x: number, color: number, delay: number) => {
        const g = new THREE.Group();
        g.position.set(x, -0.6, 0);
        for (let i = 0; i < 3; i++) {
            const c = edges(new THREE.CylinderGeometry(1.1, 1.1, 0.7, 24, 1), color, 0.9);
            c.position.y = i * 0.85 - 0.85;
            g.add(c);
        }
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.4, 24), additive(color, 0.07)));
        group.add(withDelay(g, delay));
        parts.push(g);
        return g;
    };
    const mysql = disk(-5.8, CYAN, 0);
    const pg = disk(-3.2, BLUE, 0.15);

    // Redis: rychlá cache nad SQL
    const redis = new THREE.Group();
    redis.position.set(-4.5, 2.8, 0);
    redis.add(edges(new THREE.BoxGeometry(1.4, 1.4, 1.4), RED, 1));
    redis.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), additive(RED, 0.15)));
    group.add(withDelay(redis, 0.5));
    parts.push(redis);

    // ScyllaDB: kruh uzlů, data se replikují dokola
    const scylla = new THREE.Group();
    scylla.position.set(3.4, 0, 0);
    Array.from({length: 6}, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        const p = v(Math.cos(a) * 2.8, 0, Math.sin(a) * 2.8);
        const n = edges(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 16), MINT, 1);
        n.position.copy(p);
        scylla.add(n);
    });
    scylla.add(new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.03, 6, 96), additive(MINT, 0.5)).rotateX(Math.PI / 2));
    group.add(withDelay(scylla, 0.8));
    parts.push(scylla);
    const reps = [0, 1, 2].map((i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), additive(MINT, 1));
        scylla.add(m);
        return {m, phase: i / 3};
    });
    const hits = [0, 1, 2, 3].map((i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), additive(i % 2 ? RED : CYAN, 1));
        group.add(m);
        return {m, from: i % 2 ? mysql.position : pg.position, phase: i / 4};
    });

    placeLabels(group, parts, labels, [v(-4.5, -2.8, 0.6), v(-4.5, 4.2, 0), v(3.4, 1.6, 0)]);

    return {
        group,
        update(t) {
            assemble(parts, t);
            scylla.rotation.y = t * 0.35;
            redis.rotation.y = t * 1.2;
            redis.rotation.x = t * 0.5;
            for (const r of reps) {
                const k = (t * 0.4 + r.phase) % 1;
                const a = k * Math.PI * 2;
                r.m.position.set(Math.cos(a) * 2.8, Math.abs(Math.sin(k * Math.PI * 6)) * 0.6, Math.sin(a) * 2.8);
                r.m.visible = t > 1.2;
            }
            for (const h of hits) {
                const k = (t * 1.2 + h.phase) % 1;
                h.m.position.lerpVectors(h.from, redis.position, k < 0.5 ? k * 2 : 2 - k * 2);
                h.m.visible = t > 1;
            }
        },
        dispose: () => disposeGroup(group),
    };
}

// --- O mně: pilot — ID karta s fotkou, běžecký ovál ---
function aboutPilot(labels: string[], image?: string): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const card = new THREE.Group();
    card.position.y = 1.4;
    const frame = edges(new THREE.BoxGeometry(3.2, 4.1, 0.1), CYAN, 1);
    card.add(frame);
    const photoMat = new THREE.MeshBasicMaterial({color: 0x9fdcff, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false});
    if (image) {
        new THREE.TextureLoader().load(image, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            photoMat.map = tex;
            photoMat.needsUpdate = true;
        });
    }
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.82), photoMat);
    card.add(photo);
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.06), additive(CYAN, 0.9));
    scan.position.z = 0.06;
    card.add(scan);
    group.add(withDelay(card, 0));
    parts.push(card);

    // běžecká dráha, po ní běží svítící bod se stopou
    const track = new THREE.EllipseCurve(0, 0, 6.2, 3.6);
    const trackPts = track.getPoints(120).map((p) => v(p.x, -2.6, p.y));
    for (let lane = 0; lane < 3; lane++) {
        const l = withDelay(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(trackPts.map((p) => p.clone().multiplyScalar(1 + lane * 0.07).setY(-2.6))), lineMat(lane === 1 ? MINT : BLUE, 0.4)), 0.3 + lane * 0.1);
        group.add(l);
        parts.push(l);
    }
    const runner = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), additive(MINT, 1));
    group.add(runner);
    const trail = Array.from({length: 14}, (_, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.14 * (1 - i / 16), 8, 6), additive(MINT, 0.6 * (1 - i / 14)));
        group.add(m);
        return m;
    });
    // Olomouc pin
    const pin = new THREE.Group();
    pin.position.set(4.6, 0.8, -1);
    pin.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 40), additive(MINT, 0.9)));
    pin.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), additive(MINT, 1)));
    group.add(withDelay(pin, 0.6));
    parts.push(pin);

    placeLabels(group, parts, labels, [v(4.6, 1.8, -1), v(0, 4.1, 0), v(-5.6, -1.6, 0)], 0.8);

    const tmp = new THREE.Vector2();
    return {
        group,
        update(t) {
            assemble(parts, t);
            card.rotation.y = Math.sin(t * 0.6) * 0.5;
            scan.position.y = 1.9 - ((t * 0.5) % 1) * 3.8;
            pin.rotation.y = t * 2;
            const k = (t * 0.12) % 1;
            track.getPoint(k, tmp);
            runner.position.set(tmp.x * 1.07, -2.4, tmp.y * 1.07);
            runner.visible = t > 0.8;
            trail.forEach((m, i) => {
                track.getPoint((k - (i + 1) * 0.008 + 1) % 1, tmp);
                m.position.set(tmp.x * 1.07, -2.4, tmp.y * 1.07);
                m.visible = runner.visible;
            });
        },
        dispose: () => disposeGroup(group),
    };
}

// --- O mně: roky praxe — časová spirála s milníky ---
function aboutYears(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const from = 2018;
    const to = new Date().getFullYear();
    const years = to - from;
    const at = (y: number) => {
        const k = (y - from) / years;
        const a = k * Math.PI * 2 * 1.6;
        return v(Math.cos(a) * 4.2, -3.4 + k * 7, Math.sin(a) * 4.2);
    };
    const curvePts = Array.from({length: 200}, (_, i) => at(from + (i / 199) * years));
    const helix = withDelay(line(curvePts, BLUE, 0.6), 0);
    group.add(helix);
    parts.push(helix);
    for (let y = from; y <= to; y++) {
        const p = at(y);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 32), additive(CYAN, 0.9));
        ring.position.copy(p);
        group.add(withDelay(ring, 0.2 + (y - from) * 0.12));
        parts.push(ring);
        const l = withDelay(label(String(y), "#8fb6d6", 0.6), 0.3 + (y - from) * 0.12);
        l.position.copy(p).add(v(0, 0.55, 0));
        group.add(l);
        parts.push(l);
    }
    // milníky: Quadient 2018, Worldee 2019, WorkMux dnes
    const milestones = [2018.3, 2019.5, to - 0.3].map((y, i) => {
        const p = at(Math.min(y, to));
        const m = edges(new THREE.OctahedronGeometry(0.55), [BLUE, CYAN, MINT][i], 1);
        m.position.copy(p);
        group.add(withDelay(m, 0.8 + i * 0.3));
        parts.push(m);
        return p.clone().add(v(p.x > 0 ? 1.8 : -1.8, -0.2, 0));
    });
    placeLabels(group, parts, labels, milestones, 1.1);
    const comet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), additive(MINT, 1));
    group.add(comet);

    return {
        group,
        update(t) {
            assemble(parts, t);
            const k = Math.min(Math.max((t - 0.3) / 3, 0), 1);
            comet.position.copy(at(from + k * years));
            comet.visible = t > 0.3;
            comet.scale.setScalar(1 + Math.sin(t * 6) * 0.2);
        },
        dispose: () => disposeGroup(group),
    };
}

// --- O mně: repozitáře — galaxie ~35 repozitářů ---
function aboutRepos(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const galaxy = new THREE.Group();
    group.add(galaxy);
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), additive(CYAN, 0.8));
    galaxy.add(withDelay(coreMesh, 0));
    parts.push(coreMesh);
    const rnd = seeded(11);
    const repoPos: THREE.Vector3[] = [];
    for (let i = 0; i < 35; i++) {
        const arm = i % 3;
        const k = (i / 35) * 1 + rnd() * 0.08;
        const a = arm * (Math.PI * 2 / 3) + k * 4.2;
        const r = 1.3 + k * 6;
        const p = v(Math.cos(a) * r, (rnd() - 0.5) * 0.8, Math.sin(a) * r);
        repoPos.push(p);
        const big = i === 4 || i === 13 || i === 22;
        const m = big ? edges(new THREE.BoxGeometry(0.6, 0.6, 0.6), MINT, 1) : new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), additive([CYAN, BLUE, DEEP][arm], 0.9));
        m.position.copy(p);
        galaxy.add(withDelay(m, 0.1 + i * 0.03));
        parts.push(m);
    }
    const dust = new THREE.BufferGeometry();
    const dp = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
        const a = rnd() * Math.PI * 2 + (i % 3) * 2.1;
        const r = 1 + rnd() * 7.5;
        dp.set([Math.cos(a + r * 0.6) * r, (rnd() - 0.5) * 0.5, Math.sin(a + r * 0.6) * r], i * 3);
    }
    dust.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    const dustPts = new THREE.Points(dust, new THREE.PointsMaterial({color: BLUE, size: 0.06, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false}));
    galaxy.add(withDelay(dustPts, 0.2));
    parts.push(dustPts);

    [4, 13, 22].forEach((idx, i) => {
        const l = withDelay(label(labels[i] ?? "", ["#38d6ff", "#58a6ff", "#6ef2c0"][i], 0.8), 1.4 + i * 0.25);
        l.position.copy(repoPos[idx]).add(v(0, 0.9, 0));
        galaxy.add(l);
        parts.push(l);
    });

    return {
        group,
        update(t) {
            assemble(parts, t);
            galaxy.rotation.y = t * 0.12;
            coreMesh.scale.setScalar((coreMesh.visible ? 1 : 0) * (1 + Math.sin(t * 2) * 0.08));
        },
        dispose: () => disposeGroup(group),
    };
}

// --- O mně: commity — 3D graf aktivity (týdny × dny) ---
function aboutCommits(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    const weeks = 26;
    const rnd = seeded(5);
    const barGeo = new THREE.BoxGeometry(0.34, 1, 0.34);
    barGeo.translate(0, 0.5, 0);
    const bars: Array<{m: THREE.Mesh; h: number; delay: number}> = [];
    for (let w = 0; w < weeks; w++) {
        for (let d = 0; d < 7; d++) {
            const weekend = d >= 5;
            const h = weekend ? rnd() * 0.6 : 0.2 + Math.pow(rnd(), 1.6) * 3.4 * (0.6 + 0.4 * Math.sin(w * 0.4));
            const color = h > 2.4 ? MINT : h > 1.2 ? CYAN : DEEP;
            const m = new THREE.Mesh(barGeo, additive(color, 0.75));
            m.position.set((w - weeks / 2) * 0.44, -2.6, (d - 3) * 0.44);
            m.scale.y = 0.001;
            group.add(m);
            bars.push({m, h, delay: 0.2 + w * 0.05 + d * 0.02});
        }
    }
    const base = edges(new THREE.BoxGeometry(weeks * 0.44 + 0.4, 0.1, 7 * 0.44 + 0.4), BLUE, 0.6);
    base.position.y = -2.65;
    group.add(withDelay(base, 0));
    parts.push(base);
    // commit "kapky" padají do grafu
    const drops = Array.from({length: 10}, (_, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), additive(MINT, 1));
        group.add(m);
        return {m, phase: i / 10, x: (rnd() - 0.5) * weeks * 0.44, z: (rnd() - 0.5) * 3};
    });
    placeLabels(group, parts, labels, [v(0, 3.4, 0), v(-5.4, 2, 0), v(5.4, 2, 0)], 1.4);

    return {
        group,
        update(t) {
            assemble(parts, t);
            for (const b of bars) {
                const k = THREE.MathUtils.clamp((t - b.delay) / 0.8, 0, 1);
                b.m.scale.y = Math.max(easeOutBack(k) * b.h, 0.001);
            }
            for (const d of drops) {
                const k = (t * 0.5 + d.phase) % 1;
                d.m.position.set(d.x, 4 - k * 6.6, d.z);
                d.m.visible = t > 1.6;
            }
        },
        dispose: () => disposeGroup(group),
    };
}

// --- O mně: hvězdy — 7 hvězd Ironbeanu = Velký vůz ---
function starShape(r: number): THREE.ShapeGeometry {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        const rr = i % 2 ? r * 0.42 : r;
        if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
}

function aboutStars(labels: string[]): Showcase {
    const group = new THREE.Group();
    const parts: THREE.Object3D[] = [];
    // Alkaid, Mizar, Alioth, Megrez, Phecda, Merak, Dubhe
    const pos = [v(-6, 2.2, 0.4), v(-3.9, 2.8, -0.2), v(-1.9, 2.4, 0.3), v(0.1, 1.6, 0), v(0.6, -0.9, 0.5), v(3.6, -1.4, -0.3), v(4.1, 1.5, 0.2)];
    const stars = pos.map((p, i) => {
        const g = new THREE.Group();
        g.position.copy(p);
        g.add(new THREE.Mesh(starShape(0.55), new THREE.MeshBasicMaterial({color: 0xffd76e, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false})));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), additive(0xffd76e, 0.12)));
        group.add(withDelay(g, 0.2 + i * 0.25));
        parts.push(g);
        return g;
    });
    const order = [0, 1, 2, 3, 6, 5, 4, 3];
    const seq = order.slice(1).map((b, i) => {
        const l = line([pos[order[i]], pos[b]], CYAN, 0.6);
        group.add(l);
        return {l, at: 2 + i * 0.25};
    });
    // Ironbean "fazole" uprostřed
    const bean = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.6, 6, 12), additive(MINT, 0.5));
    bean.position.set(-1.2, -2.6, 0);
    bean.rotation.z = 0.9;
    group.add(withDelay(bean, 1.6));
    parts.push(bean);
    const beanEdge = edges(new THREE.CapsuleGeometry(0.5, 0.6, 4, 8), MINT, 0.8);
    bean.add(beanEdge);

    placeLabels(group, parts, labels, [v(-1.2, -3.9, 0), v(4.1, 2.9, 0), v(-6, 3.6, 0)], 1.8);

    return {
        group,
        update(t) {
            assemble(parts, t);
            stars.forEach((s, i) => {
                s.rotation.z = t * 0.6 + i;
            });
            for (const s of seq) s.l.visible = t > s.at;
            bean.rotation.y = t;
        },
        dispose: () => disposeGroup(group),
    };
}

const BUILDERS: Record<string, (labels: string[], image?: string) => Showcase> = {
    workmux,
    ironbean,
    overcup,
    armygame,
    worldee,
    quadient,
    "stack-backend": stackBackend,
    "stack-frontend": stackFrontend,
    "stack-lang": stackLang,
    "stack-ai": stackAi,
    "stack-infra": stackInfra,
    "stack-db": stackDb,
    "about-pilot": aboutPilot,
    "about-years": aboutYears,
    "about-repos": aboutRepos,
    "about-commits": aboutCommits,
    "about-stars": aboutStars,
};

export function buildShowcase(id: string, labels: string[], image?: string): Showcase {
    return (BUILDERS[id] ?? workmux)(labels, image);
}
