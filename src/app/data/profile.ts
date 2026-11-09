/**
 * Veškerý statický obsah webu mimo překladů UI (ty jsou v i18n.ts).
 * Drž to aktuální — když přibude projekt, skill nebo role, přidej ho sem.
 */

export type StackLevel = "expert" | "strong";
export type ProjectKind = "work" | "oss" | "ai" | "game" | "framework";

export interface ProfileLinks {
    emails: string[];
    github: string;
    linkedin: string;
    location: string;
}

export interface StatCard {
    /** id 3D vizualizace (about-<id>) */
    id: string;
    value: string;
    /** klíč do i18n — krátký popisek pod číslem */
    labelKey: string;
}

export interface AboutCopy {
    /** klíče do i18n; samotné odstavce jsou v i18n, tady jsou jen reference */
    paragraphKeys: [string, string];
    stats: StatCard[];
}

export interface StackCategory {
    /** id 3D vizualizace (stack-<id>) */
    id: string;
    /** klíč do i18n (title) */
    titleKey: string;
    level: StackLevel;
    tags: string[];
}

/** výřez záběru v % šířky / výšky: [x, y, w, h] — kam se kamera přiblíží */
export type DemoBox = [number, number, number, number];

/**
 * Komentář k záběru: u videa zazní v čase `at` (s), u obrázku jdou komentáře
 * po sobě. Replika je klíč fsd.say.demo-* — nadabuje ji build-fsd-voice.mjs.
 */
export interface DemoCue {
    at?: number;
    say: string;
    box?: DemoBox;
}

/**
 * Reálná ukázka z produkce (public/demos/<projekt>/). `src` je cesta bez
 * přípony: video = .webm + .mp4 a plakát .webp, obrázek = .webp.
 * `localized` = soubor existuje pro každý jazyk zvlášť (src-cs, src-en).
 */
export interface DemoItem {
    type: "video" | "image";
    src: string;
    /** šířka / výška záběru — výřezy komentářů jsou v % právě tohohle rámu */
    aspect: number;
    /** klíč do i18n — nadpis záběru */
    captionKey: string;
    cues: DemoCue[];
    localized?: boolean;
    /** false = FSD tenhle záběr při průjezdu přeskočí (ať jízda netrvá věčnost) */
    fsd?: false;
}

export interface Project {
    title: string;
    kind: ProjectKind;
    /** klíč do i18n — krátký popis (1–2 věty) */
    descKey: string;
    tags: string[];
    /** odkaz na běžící produkci (ne na repo — ta jsou většinou soukromá) */
    href?: string;
    /** záznamy a screenshoty z produkce; první se přehrává jako náhled */
    demos?: DemoItem[];
}

export interface ExperienceEntry {
    /** rok od */
    from: number;
    /** rok do; null = dosud */
    to: number | null;
    logoSrc: string;
    logoAlt: string;
    title: string;
    company: string;
    /** klíč do i18n — popis role (1–2 věty) */
    descKey: string;
    /** místo ve 3D městě (data/places.ts) */
    placeId: string;
}

export interface EducationEntry {
    from: number;
    to: number;
    logoSrc: string;
    title: string;
    school: string;
    placeId: string;
}

export const profile: ProfileLinks = {
    emails: ["z.mazurak35@gmail.com"],
    github: "https://github.com/killov",
    linkedin: "https://www.linkedin.com/in/zden%C4%9Bk-mazur%C3%A1k-582972162/",
    location: "Olomouc, Česko",
};

export const about: AboutCopy = {
    paragraphKeys: ["about.p1", "about.p2"],
    stats: [
        {id: "years", value: "6+", labelKey: "about.stat.years"},
        {id: "repos", value: "~35", labelKey: "about.stat.repos"},
        {id: "commits", value: "8 381", labelKey: "about.stat.commits"},
        {id: "stars", value: "7⭐", labelKey: "about.stat.stars"},
    ],
};

export const stack: StackCategory[] = [
    {
        id: "backend",
        titleKey: "stack.cat.backend",
        level: "expert",
        tags: [
            "PHP 8.4",
            "Nette",
            "Latte",
            "PHPStan",
            "TypeScript",
            "Node.js",
        ],
    },
    {
        id: "frontend",
        titleKey: "stack.cat.frontend",
        level: "strong",
        tags: ["React", "MobX", "Next.js", "SCSS/Less", "Dart/Flutter"],
    },
    {
        id: "lang",
        titleKey: "stack.cat.lang",
        level: "strong",
        tags: ["C#/.NET", "Java", "TypeScript"],
    },
    {
        id: "ai",
        titleKey: "stack.cat.ai",
        level: "strong",
        tags: ["Claude Code", "MCP servery", "Gemini", "WorkMux"],
    },
    {
        id: "infra",
        titleKey: "stack.cat.infra",
        level: "strong",
        tags: ["Docker", "AWS (S3/SQS/IAM)", "GitHub Actions", "Playwright"],
    },
    {
        id: "db",
        titleKey: "stack.cat.db",
        level: "strong",
        tags: ["MySQL", "PostgreSQL", "Redis", "ScyllaDB", "Prisma"],
    },
];

export const projects: Project[] = [
    {
        title: "WorkMux",
        kind: "ai",
        descKey: "projects.workmux.desc",
        tags: ["TypeScript", "Go", "Docker", "Electron"],
        href: "https://www.workmux.com",
        demos: [
            {
                type: "video", src: "/demos/workmux/product", aspect: 16 / 9, captionKey: "demo.workmux.product",
                cues: [
                    {at: 0.5, say: "fsd.say.demo-workmux-product-1"},
                    {at: 4.6, say: "fsd.say.demo-workmux-product-2", box: [0, 8, 18, 72]},
                    {at: 10.5, say: "fsd.say.demo-workmux-product-3", box: [0, 24, 100, 54]},
                    {at: 17.2, say: "fsd.say.demo-workmux-product-4"},
                    {at: 25.5, say: "fsd.say.demo-workmux-product-5"},
                    {at: 36.5, say: "fsd.say.demo-workmux-product-6", box: [4, 30, 48, 55]},
                    {at: 45, say: "fsd.say.demo-workmux-product-7", box: [15, 0, 22, 100]},
                    {at: 53, say: "fsd.say.demo-workmux-product-8"},
                ],
            },
            {
                type: "image", src: "/demos/workmux/landing", aspect: 1440 / 900, captionKey: "demo.workmux.landing", localized: true,
                cues: [
                    {say: "fsd.say.demo-workmux-landing-1", box: [9, 36, 82, 64]},
                    {say: "fsd.say.demo-workmux-landing-2", box: [9, 17, 82, 18]},
                ],
            },
            {
                type: "image", src: "/demos/workmux/compare", aspect: 1440 / 600, captionKey: "demo.workmux.compare", localized: true, fsd: false,
                cues: [
                    {say: "fsd.say.demo-workmux-compare-1", box: [9, 57, 82, 34]},
                ],
            },
        ],
    },
    {
        title: "Drive",
        kind: "game",
        descKey: "projects.drive.desc",
        tags: ["Three.js", "WebGL", "OpenStreetMap", "Multiplayer"],
        href: "https://drive.in.workmux.com/",
        demos: [
            {
                type: "video", src: "/demos/drive/flyover", aspect: 16 / 9, captionKey: "demo.drive.flyover",
                cues: [
                    {at: 0.5, say: "fsd.say.demo-drive-flyover-1"},
                    {at: 6, say: "fsd.say.demo-drive-flyover-2"},
                    {at: 13, say: "fsd.say.demo-drive-flyover-3", box: [0, 45, 100, 55]},
                    {at: 18.5, say: "fsd.say.demo-drive-flyover-4", box: [42, 16, 22, 26]},
                    {at: 22.5, say: "fsd.say.demo-drive-flyover-5"},
                ],
            },
            {
                type: "image", src: "/demos/drive/shot-1", aspect: 16 / 9, captionKey: "demo.drive.shot1",
                cues: [
                    {say: "fsd.say.demo-drive-shot1-1", box: [25, 25, 50, 50]},
                ],
            },
            {
                type: "image", src: "/demos/drive/shot-2", aspect: 16 / 9, captionKey: "demo.drive.shot2", fsd: false,
                cues: [
                    {say: "fsd.say.demo-drive-shot2-1", box: [0, 20, 70, 80]},
                ],
            },
            {
                type: "image", src: "/demos/drive/shot-3", aspect: 16 / 9, captionKey: "demo.drive.shot3", fsd: false,
                cues: [
                    {say: "fsd.say.demo-drive-shot3-1", box: [15, 45, 70, 55]},
                ],
            },
        ],
    },
    {
        title: "Worldee",
        kind: "work",
        descKey: "projects.worldee.desc",
        tags: ["PHP/Nette", "React", "C#/.NET", "Stripe", "ScyllaDB"],
        href: "https://www.worldee.com",
    },
    {
        title: "Ironbean",
        kind: "oss",
        descKey: "projects.ironbean.desc",
        tags: ["TypeScript", "DI", "OSS"],
        href: "https://www.npmjs.com/package/ironbean",
    },
    {
        title: "Nowity",
        kind: "framework",
        descKey: "projects.nowity.desc",
        tags: ["TypeScript", "PostgreSQL", "MobX", "Next.js", "WebSocket"],
    },
    {
        title: "OverCup",
        kind: "game",
        descKey: "projects.overcup.desc",
        tags: ["Next.js 15", "React 19", "socket.io", "Redis", "MySQL"],
        href: "https://www.overcup.net/",
        demos: [
            {
                type: "video", src: "/demos/overcup/piskvorky", aspect: 1280 / 800, captionKey: "demo.overcup.piskvorky",
                cues: [
                    {at: 0.5, say: "fsd.say.demo-overcup-piskvorky-1", box: [0, 28, 77, 72]},
                    {at: 6, say: "fsd.say.demo-overcup-piskvorky-2"},
                    {at: 13.5, say: "fsd.say.demo-overcup-piskvorky-3", box: [77, 10, 23, 12]},
                    {at: 17.6, say: "fsd.say.demo-overcup-piskvorky-4", box: [2, 48, 22, 11]},
                    {at: 21, say: "fsd.say.demo-overcup-piskvorky-5", box: [17, 16, 43, 64]},
                    {at: 30, say: "fsd.say.demo-overcup-piskvorky-6", box: [0, 17, 77, 83]},
                    {at: 33, say: "fsd.say.demo-overcup-piskvorky-7", box: [77, 18, 23, 22]},
                ],
            },
            {
                type: "video", src: "/demos/overcup/sachy", aspect: 1280 / 800, captionKey: "demo.overcup.sachy",
                cues: [
                    {at: 1.5, say: "fsd.say.demo-overcup-sachy-1", box: [14, 21, 50, 67]},
                    {at: 6, say: "fsd.say.demo-overcup-sachy-2", box: [14, 21, 50, 67]},
                    {at: 12, say: "fsd.say.demo-overcup-sachy-3", box: [32, 26, 20, 22]},
                    {at: 15.5, say: "fsd.say.demo-overcup-sachy-4", box: [0, 22, 77, 78]},
                ],
            },
            {
                type: "image", src: "/demos/overcup/lobby", aspect: 1440 / 900, captionKey: "demo.overcup.lobby", fsd: false,
                cues: [
                    {say: "fsd.say.demo-overcup-lobby-1", box: [78, 0, 22, 36]},
                ],
            },
        ],
    },
    {
        // zatím není venku — bez odkazu
        title: "ArmyGame",
        kind: "game",
        descKey: "projects.armygame.desc",
        tags: ["PHP", "JavaScript", "WebSocket", "WebGL", "MySQL"],
    },
];

export const experience: ExperienceEntry[] = [
    {
        from: 2019,
        to: null,
        logoSrc: "/worldee_com_logo.jpg",
        logoAlt: "Worldee",
        title: "Senior Backend Developer",
        company: "Worldee.com",
        descKey: "experience.worldee.desc",
        placeId: "worldee",
    },
    {
        from: 2018,
        to: 2020,
        logoSrc: "/quadient_logo.jpg",
        logoAlt: "Quadient",
        title: "Software Developer",
        company: "Quadient",
        descKey: "experience.quadient.desc",
        placeId: "quadient",
    },
];

export const education: EducationEntry[] = [
    {
        from: 2015,
        to: 2019,
        logoSrc: "/up.png",
        title: "Bc. Informatika",
        school: "Univerzita Palackého v Olomouci",
        placeId: "up",
    },
    {
        from: 2011,
        to: 2015,
        logoSrc: "/spse.png",
        title: "Elektrotechnika",
        school: "VOŠ a SPŠE Olomouc",
        placeId: "spse",
    },
];