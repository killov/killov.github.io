/**
 * Místa z CV, která jdou otevřít ve 3D městě (data budov: public/places/olomouc.json,
 * generuje scripts/build-city.mjs — souřadnice musí sedět s PLACES tam).
 */

export interface Place {
    id: string;
    lat: number;
    lon: number;
    /** krátký název (štítek ve 3D) */
    short: string;
    /** klíč do i18n — celý název */
    nameKey: string;
    address: string;
}

export const places: Place[] = [
    {id: "up", lat: 49.59249, lon: 17.26347, short: "PřF UP", nameKey: "place.up", address: "17. listopadu 1192/12, Olomouc"},
    {id: "spse", lat: 49.58986, lon: 17.27232, short: "SPŠE", nameKey: "place.spse", address: "Božetěchova 755/3, Olomouc"},
    {id: "quadient", lat: 49.59034, lon: 17.26666, short: "Quadient", nameKey: "place.quadient", address: "tř. Kosmonautů 1288/1, Olomouc"},
    {id: "worldee", lat: 49.59968, lon: 17.22595, short: "Worldee", nameKey: "place.worldee", address: "gen. Píky 300/12a, Olomouc"},
];

export const placeById = (id: string) => places.find((p) => p.id === id);
