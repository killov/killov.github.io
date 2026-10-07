/**
 * Zastávky kamery kolem planety — jedna na každou sekci webu.
 * Scroll posouvá kameru po křivce skrz tyto body (viz Universe.ts),
 * panel se obsahem se zobrazí, když kamera "dorazí".
 *
 * Planeta má poloměr 10 a stojí v počátku.
 *  - `shift`: o kolik (v jednotkách scény, kolmo na pohled) se kamera dívá vedle
 *    planety — záporné x = planeta vpravo, kladné x = planeta vlevo.
 *  - `horizon`: místo pohledu na planetu let těsně nad povrchem; kamera míří
 *    směrem `heading` a sklopí se o `tilt` stupňů, horizont je vodorovně.
 *  - `markerNdc`: místo na obrazovce (-1..1), kam padne značka na povrchu,
 *    ke které vede čára z panelu.
 */

export type PanelPlacement = "left" | "right" | "wide" | "horizon" | "center";

export interface Station {
    id: string;
    cam: [number, number, number];
    shift?: [number, number];
    horizon?: {heading: [number, number, number]};
    markerNdc: [number, number];
    placement: PanelPlacement;
}

export const STATIONS: Station[] = [
    {id: "hero", cam: [5, 4, 34], shift: [-11, -1], markerNdc: [0.5, 0.15], placement: "left"},
    {id: "about", cam: [-27, 9, 17], shift: [11, 0], markerNdc: [-0.42, 0.05], placement: "right"},
    {id: "stack", cam: [-8, 31, 15], shift: [-13, -6], markerNdc: [0.62, -0.1], placement: "wide"},
    {id: "projects", cam: [32, -6, -32], shift: [-19, 1], markerNdc: [0.72, 0.15], placement: "wide"},
    {id: "experience", cam: [2.4, 13.3, -3.5], horizon: {heading: [0, 0, -1]}, markerNdc: [0.35, -0.72], placement: "horizon"},
    {id: "education", cam: [-10.5, 8.8, 2.9], horizon: {heading: [0, 0, 1]}, markerNdc: [0.42, -0.72], placement: "horizon"},
    {id: "contact", cam: [12, 13, 60], shift: [-20, -1], markerNdc: [0.45, 0.2], placement: "left"},
];

/** výška scrollu na jeden přelet mezi zastávkami (ve vh) */
export const VH_PER_STATION = 140;

/**
 * Převod surového scrollu (0..N-1) na pozici kamery s "prodlevou" u každé
 * zastávky — kolem celého čísla se kamera zastaví, aby šel panel číst,
 * mezi nimi plynule přeletí.
 */
export function holdAtStations(raw: number): number {
    const seg = Math.floor(raw);
    const f = raw - seg;
    const t = Math.min(Math.max((f - 0.28) / (0.72 - 0.28), 0), 1);
    return seg + t * t * (3 - 2 * t);
}
