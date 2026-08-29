// Rychlý e2e smoke test pro redesign.
// Spustí se přes `node scripts/test-portfolio.mjs` proti běžícímu dev serveru.
// Ověří: render všech sekcí, CZ/EN přepnutí, žádné konzolové errory,
//         viewport desktop + mobil.

import {chromium} from "playwright";
import {writeFileSync, mkdirSync} from "node:fs";

const URL = "http://localhost:3000/";
const OUT = "/tmp/portfolio-shots";
mkdirSync(OUT, {recursive: true});

const browser = await chromium.launch();
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

await check("desktop render + i18n + sekce", async () => {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
    const page = await ctx.newPage();
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(`[desktop] ${msg.text()}`);
    });
    page.on("pageerror", (err) => consoleErrors.push(`[desktop pageerror] ${err.message}`));
    await page.goto(URL, {waitUntil: "networkidle"});

    // Hero
    await page.locator("h1").first().waitFor({timeout: 5000});
    const heroText = await page.locator("h1").first().innerText();
    if (!heroText.includes("Zdeněk Mazurák")) {
        throw new Error(`Hero neobsahuje jméno: "${heroText}"`);
    }

    // Všechny sekce
    const sections = ["O mně", "Stack", "Co stavím", "Zkušenosti", "Vzdělání", "Kontakt"];
    for (const s of sections) {
        const el = page.getByRole("heading", {name: s, level: 2});
        if (!(await el.count())) throw new Error(`Chybí sekce "${s}"`);
    }

    // Stack — alespoň PHP 8.4 tag
    const phpTag = await page.locator("text=/^PHP 8.4$/").count();
    if (phpTag < 1) throw new Error("Chybí PHP 8.4 tag ve Stack");

    // Stack — TypeScript je v expert kategorii (Backend & runtime)
    const tsTag = page.locator("text=/^TypeScript$/");
    if ((await tsTag.count()) < 1) throw new Error("Chybí TypeScript tag");

    // Stack — Kubernetes/EKS je v expert kategorii (Backend & runtime)
    const k8sTag = page.locator("text=/^Kubernetes\\/EKS$/");
    if ((await k8sTag.count()) < 1) throw new Error("Chybí Kubernetes/EKS tag");

    // Stack — Dapper je pryč
    const dapperTag = page.locator("text=/^Dapper$/");
    if ((await dapperTag.count()) > 0) throw new Error("Dapper by neměl být přítomen");

    // Stack — Java je přítomná
    const javaTag = page.locator("text=/^Java$/");
    if ((await javaTag.count()) < 1) throw new Error("Chybí Java tag");

    // Projects — Worldee + WorkMux
    const workmux = await page.locator("h3", {hasText: "WorkMux"}).count();
    const worldee = await page.locator("h3", {hasText: "Worldee"}).count();
    if (workmux < 1 || worldee < 1) {
        throw new Error(`Chybí projektová karta: workmux=${workmux} worldee=${worldee}`);
    }

    // Worldee má odkaz na GitHub
    const worldeeLink = page.locator('a[href*="Worldee-com/web_react-php"]').count();
    if (worldeeLink < 1) throw new Error("Chybí GitHub link u Worldee");

    // Kontakt — 3 e-maily (plus 1 v hero CTA = 4 celkem)
    const mailto = await page.locator('a[href^="mailto:"]').count();
    if (mailto < 3) throw new Error(`Očekávám alespoň 3 e-maily, mám ${mailto}`);

    await page.screenshot({path: `${OUT}/desktop-cz.png`, fullPage: true});

    // Přepnutí na EN
    await page.getByRole("button", {name: "EN", exact: true}).click();
    await page.waitForTimeout(200);

    const aboutEn = await page.locator("h2", {hasText: "About"}).count();
    if (aboutEn < 1) throw new Error("Po přepnutí na EN chybí 'About'");

    const stackEn = await page.locator("h2", {hasText: "Stack"}).count();
    if (stackEn < 1) throw new Error("Po přepnutí na EN chybí 'Stack'");

    await page.screenshot({path: `${OUT}/desktop-en.png`, fullPage: true});

    // Zpět na CZ
    await page.getByRole("button", {name: "CZ", exact: true}).click();
    await page.waitForTimeout(200);
    const aboutCz = await page.locator("h2", {hasText: "O mně"}).count();
    if (aboutCz < 1) throw new Error("Po přepnutí zpět na CZ chybí 'O mně'");

    await ctx.close();
});

await check("mobilní viewport", async () => {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
    const page = await ctx.newPage();
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(`[mobile] ${msg.text()}`);
    });
    await page.goto(URL, {waitUntil: "networkidle"});

    await page.locator("h1").first().waitFor({timeout: 5000});
    await page.screenshot({path: `${OUT}/mobile-cz.png`, fullPage: true});
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