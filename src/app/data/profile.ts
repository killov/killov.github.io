/**
 * Veškerý statický obsah webu mimo překladů UI (ty jsou v i18n.ts).
 * Drž to aktuální — když přibude projekt, skill nebo role, přidej ho sem.
 */

export type StackLevel = "expert" | "strong";
export type ProjectKind = "work" | "oss" | "ai";

export interface ProfileLinks {
    emails: string[];
    github: string;
    linkedin: string;
    location: string;
}

export interface StatCard {
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
    /** klíč do i18n (title) */
    titleKey: string;
    level: StackLevel;
    tags: string[];
}

export interface Project {
    title: string;
    kind: ProjectKind;
    /** klíč do i18n — krátký popis (1–2 věty) */
    descKey: string;
    tags: string[];
    href?: string;
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
}

export interface EducationEntry {
    from: number;
    to: number;
    logoSrc: string;
    title: string;
    school: string;
}

export const profile: ProfileLinks = {
    emails: [
        "z.mazurak35@gmail.com",
        "z.mazurak@seznam.cz",
        "zdenek.mazurak@worldee.com",
    ],
    github: "https://github.com/killov",
    linkedin: "https://www.linkedin.com/in/zden%C4%9Bk-mazur%C3%A1k-582972162/",
    location: "Olomouc, Česko",
};

export const about: AboutCopy = {
    paragraphKeys: ["about.p1", "about.p2"],
    stats: [
        {value: "6+", labelKey: "about.stat.years"},
        {value: "~35", labelKey: "about.stat.repos"},
        {value: "8 381", labelKey: "about.stat.commits"},
        {value: "7⭐", labelKey: "about.stat.stars"},
    ],
};

export const stack: StackCategory[] = [
    {
        titleKey: "stack.cat.backend",
        level: "expert",
        tags: [
            "PHP 8.4",
            "Nette",
            "Latte",
            "PHPStan",
            "TypeScript",
            "Node.js",
            "Kubernetes/EKS",
            "Helm",
        ],
    },
    {
        titleKey: "stack.cat.frontend",
        level: "strong",
        tags: ["React", "MobX", "Next.js", "SCSS/Less", "Dart/Flutter"],
    },
    {
        titleKey: "stack.cat.lang",
        level: "strong",
        tags: ["C#/.NET", "Java", "ScyllaDB Driver", "TypeScript"],
    },
    {
        titleKey: "stack.cat.ai",
        level: "strong",
        tags: ["Claude Code", "MCP servery", "Gemini", "WorkMux"],
    },
    {
        titleKey: "stack.cat.infra",
        level: "strong",
        tags: ["Docker", "Terraform", "AWS (S3/SQS/IAM)", "GitHub Actions", "Playwright"],
    },
    {
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
        href: "https://github.com/workmuxtool/workmux",
    },
    {
        title: "Ironbean",
        kind: "oss",
        descKey: "projects.ironbean.desc",
        tags: ["TypeScript", "DI", "OSS"],
        href: "https://github.com/ironbean/ironbean",
    },
    {
        title: "Worldee",
        kind: "work",
        descKey: "projects.worldee.desc",
        tags: ["PHP/Nette", "React", "C#/.NET", "Stripe", "ScyllaDB", "Helm"],
        href: "https://github.com/Worldee-com/web_react-php",
    },
    {
        title: "Quadient",
        kind: "work",
        descKey: "projects.quadient.desc",
        tags: ["C#/.NET", "Enterprise"],
    },
];

export const experience: ExperienceEntry[] = [
    {
        from: 2019,
        to: null,
        logoSrc: "/worldee_com_logo.jpg",
        logoAlt: "Worldee",
        title: "Backend / Tech Lead",
        company: "Worldee.com",
        descKey: "experience.worldee.desc",
    },
    {
        from: 2018,
        to: 2020,
        logoSrc: "/quadient_logo.jpg",
        logoAlt: "Quadient",
        title: "Software Developer",
        company: "Quadient",
        descKey: "experience.quadient.desc",
    },
];

export const education: EducationEntry[] = [
    {
        from: 2015,
        to: 2019,
        logoSrc: "/up.png",
        title: "Bc. Informatika",
        school: "Univerzita Palackého v Olomouci",
    },
    {
        from: 2011,
        to: 2015,
        logoSrc: "/spse.png",
        title: "Elektrotechnika",
        school: "VOŠ a SPŠE Olomouc",
    },
];