// Rychlý e2e smoke test pro redesign.
// Spustí se přes `node scripts/test-portfolio.mjs` proti běžícímu dev serveru.
// Ověří: 3D scénu, let po všech zastávkách (navigace i klávesnice), obsah,
//         CZ/EN přepnutí, žádné konzolové errory, viewport desktop + mobil.

import {chromium} from "playwright";
import {writeFileSync, mkdirSync} from "node:fs";

const URL = "http://localhost:3000/";
const OUT = "/tmp/portfolio-shots";
mkdirSync(OUT, {recursive: true});

// WebGL i v headless (softwarový renderer)
const browser = await chromium.launch({args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
const consoleErrors = [];

async function check(label, fn) {
    process.stdout.write(`\n=== ${label} ===\n`);
    try {
        await fn();
        console.log(`OK ${label}`);
    } catch (e) {
        console.log(`FAIL ${label}: ${e.message}`);
        process.exitCode = 1;
    }
}

await check("desktop: let po zastávkách + obsah + i18n", async () => {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
    const page = await ctx.newPage();
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(`[desktop] ${msg.text()}`);
    });
    page.on("pageerror", (err) => consoleErrors.push(`[desktop pageerror] ${err.message}`));
    await page.goto(URL, {waitUntil: "networkidle"});

    // Hero (po boot sekvenci)
    await page.locator("h1", {hasText: "Zdeněk Mazurák"}).waitFor({state: "visible", timeout: 8000});

    // 3D scéna běží
    const hasGl = await page.locator("canvas").evaluate((c) => !!(c.getContext("webgl2") || c.getContext("webgl")));
    if (!hasGl) throw new Error("Canvas nemá WebGL kontext");

    // Každá sekce: klik v navigaci → kamera doletí → panel s nadpisem je vidět
    const sections = ["O mně", "Stack", "Co stavím", "Zkušenosti", "Vzdělání", "Kontakt"];
    for (const [i, name] of sections.entries()) {
        await page.locator("nav a").nth(i + 1).click();
        await page.getByRole("heading", {name, level: 2}).waitFor({state: "visible", timeout: 6000});
    }

    // Klávesnice: Home → start, PageDown → O mně
    await page.keyboard.press("Home");
    await page.locator("h1").waitFor({state: "visible", timeout: 6000});
    await page.keyboard.press("PageDown");
    await page.getByRole("heading", {name: "O mně", level: 2}).waitFor({state: "visible", timeout: 6000});

    // Obsah (je v DOM i když panel zrovna není vidět)
    if ((await page.locator("text=/^PHP 8.4$/").count()) < 1) throw new Error("Chybí PHP 8.4 tag ve Stack");
    if ((await page.locator("text=/^Java$/").count()) < 1) throw new Error("Chybí Java tag");
    for (const gone of ["Kubernetes/EKS", "Helm", "ScyllaDB Driver", "Dapper", "Terraform"]) {
        if ((await page.getByText(gone, {exact: true}).count()) > 0) {
            throw new Error(`${gone} by neměl být přítomen`);
        }
    }
    for (const title of ["WorkMux", "Worldee", "ArmyGame", "OverCup"]) {
        if ((await page.locator("h3", {hasText: title}).count()) < 1) throw new Error(`Chybí projekt ${title}`);
    }
    if ((await page.locator('a[href*="Worldee-com/web_react-php"]').count()) < 1) throw new Error("Chybí GitHub link u Worldee");
    const mailtos = await page.locator('a[href^="mailto:"]').evaluateAll((els) => els.map((a) => a.getAttribute("href")));
    if (!mailtos.length || mailtos.some((href) => href !== "mailto:z.mazurak35@gmail.com")) {
        throw new Error(`Očekávám jen Gmail, mám ${mailtos.join(", ")}`);
    }
    if ((await page.getByText(/7 000 Kč/).count()) < 1) throw new Error("Chybí sazba 7 000 Kč");

    // Projekt → 3D hologram s popisem, Esc ho zavře
    await page.locator("nav a").nth(3).click();
    await page.locator("article").first().getByRole("button", {name: /Ukázat ve 3D/}).waitFor({state: "visible", timeout: 6000});
    await page.locator("article").first().getByRole("button", {name: /Ukázat ve 3D/}).click();
    const dialog = page.getByRole("dialog", {name: "WorkMux"});
    await dialog.waitFor({state: "visible", timeout: 3000});
    await page.screenshot({path: `${OUT}/desktop-showcase.png`});
    await page.keyboard.press("Escape");
    await dialog.waitFor({state: "detached", timeout: 3000});

    // Stack: klik na kategorii → 3D vizualizace
    await page.locator("nav a").nth(2).click();
    await page.locator('[data-stack="frontend"]').waitFor({state: "visible", timeout: 6000});
    await page.locator('[data-stack="frontend"]').click();
    const stackDialog = page.getByRole("dialog", {name: "Frontend"});
    await stackDialog.waitFor({state: "visible", timeout: 3000});
    await page.screenshot({path: `${OUT}/desktop-stack-3d.png`});
    await page.getByRole("button", {name: /Zavřít/}).click();
    await stackDialog.waitFor({state: "detached", timeout: 3000});

    // O mně: kartička se statistikou → 3D vizualizace
    await page.locator("nav a").nth(1).click();
    await page.getByRole("button", {name: /hvězd na Ironbean/}).waitFor({state: "visible", timeout: 6000});
    await page.getByRole("button", {name: /hvězd na Ironbean/}).click();
    const starsDialog = page.getByRole("dialog", {name: "7 hvězd"});
    await starsDialog.waitFor({state: "visible", timeout: 3000});
    await page.keyboard.press("Escape");
    await starsDialog.waitFor({state: "detached", timeout: 3000});

    // Vesmírná hra: vstup, hod Zemí, raketa, návrat
    await page.getByRole("button", {name: "Hra", exact: true}).click();
    const gameUi = page.getByRole("dialog", {name: /Mise/});
    await gameUi.waitFor({state: "visible", timeout: 3000});
    await page.waitForTimeout(2500);
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(580, 680, {steps: 8});
    await page.mouse.up();
    await page.waitForFunction(() => document.body.innerText.includes("HODY") && /HODY\s+1/i.test(document.body.innerText), null, {timeout: 4000});
    await page.screenshot({path: `${OUT}/desktop-game.png`});
    await page.keyboard.press("Escape");
    await gameUi.waitFor({state: "detached", timeout: 3000});
    if ((await page.evaluate(() => document.documentElement.style.overflow)) !== "") throw new Error("Po hře zůstal zamčený scroll");

    // Vzdělání: klik na školu → přiblížení na Zemi → 3D město s budovou, jízda autem
    await page.locator("nav a").nth(5).click();
    await page.locator('[data-place="up"]').waitFor({state: "visible", timeout: 6000});
    await page.locator('[data-place="up"]').click();
    const cityUi = page.getByRole("dialog", {name: /Přírodovědecká fakulta/});
    await cityUi.waitFor({state: "visible", timeout: 3000});
    await page.getByRole("button", {name: /Řídit auto/}).waitFor({state: "visible", timeout: 15000});
    await page.getByRole("button", {name: /Řídit auto/}).click();
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(1500);
    await page.keyboard.up("ArrowUp");
    await page.screenshot({path: `${OUT}/desktop-city.png`});
    await page.keyboard.press("Escape");
    await cityUi.waitFor({state: "detached", timeout: 3000});
    await page.locator("nav a").nth(1).click();
    await page.getByRole("heading", {name: "O mně", level: 2}).waitFor({state: "visible", timeout: 6000});

    // Tažení po Zemi ji otočí (telemetrie se nemění, ale nesmí to spadnout ani scrollovat)
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.move(1150, 450);
    await page.mouse.down();
    await page.mouse.move(1300, 430, {steps: 6});
    await page.mouse.up();
    if (Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore) > 2) throw new Error("Tažení Zemí scrolluje stránku");

    await page.screenshot({path: `${OUT}/desktop-cz.png`});

    // Přepnutí na EN a zpět
    await page.getByRole("button", {name: "EN", exact: true}).click();
    await page.getByRole("heading", {name: "About", level: 2}).waitFor({state: "visible", timeout: 3000});
    await page.screenshot({path: `${OUT}/desktop-en.png`});
    await page.getByRole("button", {name: "CZ", exact: true}).click();
    await page.getByRole("heading", {name: "O mně", level: 2}).waitFor({state: "visible", timeout: 3000});

    await ctx.close();
});

await check("mobilní viewport", async () => {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
    const page = await ctx.newPage();
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(`[mobile] ${msg.text()}`);
    });
    await page.goto(URL, {waitUntil: "networkidle"});

    await page.locator("h1").first().waitFor({state: "visible", timeout: 8000});
    await page.screenshot({path: `${OUT}/mobile-cz.png`});
    await ctx.close();
});

await check("konzole bez errorů", async () => {
    if (consoleErrors.length) {
        consoleErrors.forEach((e) => console.log("  · " + e));
        throw new Error(`Konzole vyhodila ${consoleErrors.length} errorů`);
    }
});

await browser.close();
console.log(`\nScreenshoty: ${OUT}`);
console.log(process.exitCode ? "\nNECO SELHALO" : "\nVse OK");