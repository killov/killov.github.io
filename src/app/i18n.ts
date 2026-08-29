/**
 * Textové řetězce pro celý web, dvojjazyčně.
 * Sekce: navigation, hero, about, stack, projects, experience,
 *         education, contact, common.
 *
 * Doplňuj průběžně. Pokud přidáš klíč jen v jednom jazyce, druhý se zobrazí
 * jako fallback na klíč — takže nic nerozbiješ, ale všimneš si toho v UI.
 */

export type Lang = "cs" | "en";

export type Dict = Record<string, string>;

export const messages: Record<Lang, Dict> = {
    cs: {
        // navigation / lang switcher
        "lang.cs": "CZ",
        "lang.en": "EN",
        "nav.about": "O mně",
        "nav.stack": "Stack",
        "nav.projects": "Projekty",
        "nav.experience": "Zkušenosti",
        "nav.education": "Vzdělání",
        "nav.contact": "Kontakt",

        // hero
        "hero.availability": "Open novým příležitostem",
        "hero.role": "Senior full-stack · Backend / Tech Lead · AI nástroje pro vývojáře",
        "hero.tagline":
            "Stavím production-grade systémy (PHP/Nette, C#/.NET, React/MobX) a vlastní AI nástroje pro vývojáře. 6+ let ve Worldee jako backend lead.",
        "hero.cta.contact": "Napiš mi",
        "hero.cta.github": "GitHub",

        // about
        "about.title": "O mně",
        "about.p1":
            "Jsem backend a platform inženýr z Olomouce. Přes 6 let držím celou vertikálu produkčního travel monolitu Worldee — PHP/Nette backend, React/MobX + Next.js frontend i C#/.NET mikroservices — a vedu backend tým.",
        "about.p2":
            "Vedle toho stavím vlastní open-source ([[Ironbean]], 7⭐) a AI nástroje pro vývojáře (WorkMux, Claude Code harness). Baví mě výkon, stabilita a minimální cílené zásahy — AI beru jako pomocníka, ale výsledky si ověřuju.",
        "about.stat.years": "let praxe",
        "about.stat.repos": "veřejných repozitářů",
        "about.stat.commits": "commitů za 6 let v hlavním projektu",
        "about.stat.stars": "hvězd na Ironbean",

        // stack
        "stack.title": "Stack",
        "stack.subtitle":
            "Denně v produkci, roky. Silné = dlouhodobě a produktivně. Vše ostatní je příležitostný dotek.",
        "stack.level.expert": "Expert",
        "stack.level.strong": "Silné",
        "stack.cat.backend": "Backend & runtime",
        "stack.cat.frontend": "Frontend",
        "stack.cat.lang": "Jazyky & drivery",
        "stack.cat.ai": "AI & tooly",
        "stack.cat.infra": "Infra & DevOps",
        "stack.cat.db": "Databáze & data",

        // projects
        "projects.title": "Co stavím",
        "projects.subtitle":
            "Work + vlastní projekty. Nejvíc mi sedí, když věc jede v produkci a ostatní na ní staví.",
        "projects.kind.work": "Práce",
        "projects.kind.oss": "Open-source",
        "projects.kind.ai": "Vlastní AI nástroj",
        "projects.visit": "Otevřít",
        "projects.workmux.desc":
            "AI orchestrátor pro vývojáře — izolované Docker session, web terminály, Claude Code, Go agent přes mTLS, Electron. Můj hlavní letošní projekt.",
        "projects.ironbean.desc":
            "Vlastní DI knihovna pro TS/JS (core/react/react-router/jasmine). 7⭐, 455 commitů za 6 let, port i do Dartu.",
        "projects.worldee.desc":
            "Hlavní vývojář produkčního travel monolitu (8 381 commitů od 2020). PHP/Nette backend, React/MobX admin, C#/.NET FlightService + CarRentalService na ScyllaDB, async translate workflow nad Gemini, Stripe platby, Helm charty a k8s provoz.",
        "projects.quadient.desc":
            "Enterprise software development v C#/.NET.",

        // experience
        "experience.title": "Zkušenosti",
        "experience.worldee.desc":
            "Backend a tech lead. PHP/Nette API a admin, C#/.NETmikroservices (FlightService, CarRentalService) nad ScyllaDB a PostgreSQL, frontend v React/MobX/Next.js, async stack (ReactPHP, Redis, SQS), integrace Stripe a Gemini. Migrace na PHP 8.4, Helm/k8s, GitHub Actions.",
        "experience.quadient.desc":
            "Vývoj enterprise software v C#/.NET.",

        // education
        "education.title": "Vzdělání",

        // contact
        "contact.title": "Kontakt",
        "contact.subtitle":
            "Open novým příležitostem — remote, případně hybrid z Olomouce. Cílová sazba od 6 000 Kč / MD.",
        "contact.email.label": "E-mail",
        "contact.github.label": "GitHub",
        "contact.linkedin.label": "LinkedIn",
        "contact.location.label": "Lokalita",
        "contact.location.value": "Olomouc, Česko · remote / hybrid",

        // common
        "common.from": "od",
        "common.to": "do",
        "common.present": "dosud",

        // AI agent summary
        "ai.heading": "Profil (strojově čitelné)",
    },

    en: {
        "lang.cs": "CZ",
        "lang.en": "EN",
        "nav.about": "About",
        "nav.stack": "Stack",
        "nav.projects": "Projects",
        "nav.experience": "Experience",
        "nav.education": "Education",
        "nav.contact": "Contact",

        "hero.availability": "Open to opportunities",
        "hero.role": "Senior full-stack · Backend / Tech Lead · AI tools for developers",
        "hero.tagline":
            "I build production-grade systems (PHP/Nette, C#/.NET, React/MobX) and my own AI dev tools. 6+ years at Worldee as backend lead.",
        "hero.cta.contact": "Get in touch",
        "hero.cta.github": "GitHub",

        "about.title": "About",
        "about.p1":
            "I'm a backend and platform engineer based in Olomouc. For 6+ years I've owned the full vertical of Worldee's production travel monolith — PHP/Nette backend, React/MobX + Next.js frontend, and C#/.NET mikroservices — and I lead the backend team.",
        "about.p2":
            "On the side I build open-source ([[Ironbean]], 7⭐) and AI dev tools (WorkMux, my own Claude Code harness). I care about performance, stability and minimal targeted changes — I use AI as an assistant but I verify what ships.",
        "about.stat.years": "years of experience",
        "about.stat.repos": "public repositories",
        "about.stat.commits": "commits over 6 years in the main project",
        "about.stat.stars": "stars on Ironbean",

        "stack.title": "Stack",
        "stack.subtitle":
            "Daily in production, years at a time. Strong = long-term and productive. Everything else is occasional.",
        "stack.level.expert": "Expert",
        "stack.level.strong": "Strong",
        "stack.cat.backend": "Backend & runtime",
        "stack.cat.frontend": "Frontend",
        "stack.cat.lang": "Languages & drivers",
        "stack.cat.ai": "AI & tooling",
        "stack.cat.infra": "Infra & DevOps",
        "stack.cat.db": "Data & storage",

        "projects.title": "What I'm building",
        "projects.subtitle":
            "Work + side projects. I'm at my best when something is running in production and others build on top of it.",
        "projects.kind.work": "Work",
        "projects.kind.oss": "Open-source",
        "projects.kind.ai": "Own AI tool",
        "projects.visit": "Open",
        "projects.workmux.desc":
            "AI orchestrator for developers — isolated Docker sessions, web terminals, Claude Code, Go agent over mTLS, Electron. My main project this year.",
        "projects.ironbean.desc":
            "My own DI library for TS/JS (core/react/react-router/jasmine). 7⭐, 455 commits over 6 years, ported to Dart.",
        "projects.worldee.desc":
            "Main developer of the production travel monolith (8,381 commits since 2020). PHP/Nette backend, React/MobX admin, C#/.NET FlightService + CarRentalService on ScyllaDB, async translate workflow on Gemini, Stripe payments, Helm charts and k8s ops.",
        "projects.quadient.desc":
            "Enterprise software development in C#/.NET.",

        "experience.title": "Experience",
        "experience.worldee.desc":
            "Backend and tech lead. PHP/Nette public and admin APIs, C#/.NETmikroservices (FlightService, CarRentalService) onCyllaDB and PostgreSQL, React/MobX/Next.js frontend, async stack (ReactPHP, Redis, SQS), Stripe and Gemini integrations. Migration to PHP 8.4, Helm/k8s, GitHub Actions.",
        "experience.quadient.desc":
            "Enterprise software development in C#/.NET.",

        "education.title": "Education",

        "contact.title": "Contact",
        "contact.subtitle":
            "Open to new opportunities — remote, or hybrid from Olomouc. Day rate from 6,000 CZK.",
        "contact.email.label": "Email",
        "contact.github.label": "GitHub",
        "contact.linkedin.label": "LinkedIn",
        "contact.location.label": "Location",
        "contact.location.value": "Olomouc, Czechia · remote / hybrid",

        "common.from": "from",
        "common.to": "to",
        "common.present": "present",

        "ai.heading": "Profile (machine-readable)",
    },
};

export function t(lang: Lang, key: string): string {
    const dict = messages[lang];
    if (dict[key] !== undefined) return dict[key];
    // fallback cs → en → key
    const cs = messages.cs[key];
    if (cs !== undefined) return cs;
    return messages.en[key] ?? key;
}
