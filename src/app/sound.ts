import {useCallback, useEffect, useState} from "react";

/*
 * Zvuky rozhraní (inspirované seriálem 24) — syntetizované přes Web Audio, žádné nahrávky.
 * Prohlížeč pustí zvuk až po prvním kliknutí / klávese / dotyku, do té doby
 * se zvuky tiše zahazují. Vypínač se pamatuje v localStorage.
 */

const KEY = "sfx";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;
const listeners = new Set<(on: boolean) => void>();

if (typeof window !== "undefined") {
    enabled = window.localStorage?.getItem(KEY) !== "off";
    const unlock = () => {
        unlocked = true;
        audio()?.resume().catch(() => undefined);
        ["pointerdown", "keydown", "touchend"].forEach((e) => window.removeEventListener(e, unlock, true));
    };
    ["pointerdown", "keydown", "touchend"].forEach((e) => window.addEventListener(e, unlock, true));
}

function audio(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    return ctx;
}

/** kontext připravený k přehrávání, jinak null (vypnuto / bez interakce) */
function ready(): AudioContext | null {
    if (!enabled || !unlocked) return null;
    const c = audio();
    if (!c || c.state !== "running") return null;
    return c;
}

let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer;
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
}

function envelope(c: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(master!);
    return g;
}

/** hluboký úder s klesající výškou */
function boom(c: AudioContext, at: number, peak = 0.9) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.45);
    o.connect(envelope(c, at, peak, 0.005, 0.6));
    o.start(at);
    o.stop(at + 0.7);
}

/** kovový „klik“ hodin: krátký šum přes pásmovou propust + zvonivé FM */
function tick(c: AudioContext, at: number, pitch: number, peak = 0.5) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = pitch * 3;
    band.Q.value = 6;
    src.connect(band).connect(envelope(c, at, peak, 0.002, 0.05));
    src.start(at, Math.random() * 0.5, 0.08);

    const carrier = c.createOscillator();
    const mod = c.createOscillator();
    const modGain = c.createGain();
    carrier.frequency.value = pitch;
    mod.frequency.value = pitch * 1.41;
    modGain.gain.value = pitch * 0.8;
    mod.connect(modGain).connect(carrier.frequency);
    carrier.connect(envelope(c, at, peak * 0.35, 0.002, 0.16));
    carrier.start(at);
    mod.start(at);
    carrier.stop(at + 0.2);
    mod.stop(at + 0.2);
}

/** přelet do jiné sekce: úder + „tik-tak“ hodin */
export function playTransition() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime + 0.02;
    boom(c, t);
    tick(c, t, 520, 0.6);
    tick(c, t + 0.5, 700);
    tick(c, t + 1.0, 520);
}

/** naskočení hologramu: rychlá sekvence datových pípnutí */
export function playBlip() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime + 0.01;
    [1320, 990, 1760].forEach((f, i) => {
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        o.connect(envelope(c, t + i * 0.055, 0.09, 0.003, 0.05));
        o.start(t + i * 0.055);
        o.stop(t + i * 0.055 + 0.08);
    });
}

export function setSound(on: boolean) {
    enabled = on;
    window.localStorage?.setItem(KEY, on ? "on" : "off");
    listeners.forEach((l) => l(on));
}

/** stav vypínače zvuků pro React */
export function useSound(): [boolean, () => void] {
    const [on, setOn] = useState(true);
    useEffect(() => {
        setOn(enabled);
        listeners.add(setOn);
        return () => { listeners.delete(setOn); };
    }, []);
    const toggle = useCallback(() => setSound(!enabled), []);
    return [on, toggle];
}
