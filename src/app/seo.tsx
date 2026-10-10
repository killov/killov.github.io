import "./App.css";
import type {Metadata, Viewport} from "next";
import photo from "./zdenek.jpg";
import {LANG_PATH, Lang} from "./i18n";
import {experience, profile, projects} from "./data/profile";

/*
 * SEO pro obě jazykové verze: / (cs) a /en/ (en) jsou dvě staticky
 * vyrenderované stránky, každá s vlastním <html lang>, titulkem, popisem,
 * canonical a hreflang. Texty drž v souladu s hero/about v i18n.ts.
 */

export const SITE_URL = "https://killov.github.io";
const OG_IMAGE = "/og.png";
const PHOTO_URL = `${SITE_URL}${photo.src}`;
const PERSON_ID = `${SITE_URL}/#person`;

const copy: Record<Lang, {title: string; description: string; locale: string; jobTitle: string}> = {
    cs: {
        title: "Zdeněk Mazurák — Senior backend vývojář · WorkMux, AI nástroje pro vývojáře",
        description:
            "Senior backend a full-stack vývojář z Olomouce. 6+ let drží backend Worldee (PHP/Nette, C#/.NET, React). Staví WorkMux — AI orchestrátor pro vývojáře — a 3D multiplayer hru Drive.",
        locale: "cs_CZ",
        jobTitle: "Senior backend vývojář",
    },
    en: {
        title: "Zdeněk Mazurák — Senior backend engineer · WorkMux, AI dev tools",
        description:
            "Senior backend & full-stack engineer from Olomouc, Czechia. 6+ years on the Worldee backend (PHP/Nette, C#/.NET, React). Building WorkMux, an AI orchestrator for developers, and Drive, a 3D multiplayer game.",
        locale: "en_US",
        jobTitle: "Senior Backend Engineer",
    },
};

export function buildMetadata(lang: Lang): Metadata {
    const c = copy[lang];
    const other: Lang = lang === "cs" ? "en" : "cs";
    return {
        metadataBase: new URL(SITE_URL),
        title: {
            absolute: c.title,
            template: "%s · Zdeněk Mazurák",
        },
        description: c.description,
        applicationName: "Zdeněk Mazurák",
        authors: [{name: "Zdeněk Mazurák", url: SITE_URL}],
        creator: "Zdeněk Mazurák",
        keywords: [
            "Zdeněk Mazurák",
            "killov",
            "senior backend developer",
            "full-stack developer",
            "PHP",
            "Nette",
            "C#",
            ".NET",
            "React",
            "Next.js",
            "TypeScript",
            "AI tools for developers",
            "WorkMux",
            "Drive",
            "Worldee",
            "Ironbean",
            "Olomouc",
        ],
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                "max-image-preview": "large",
                "max-snippet": -1,
                "max-video-preview": -1,
            },
        },
        alternates: {
            canonical: LANG_PATH[lang],
            languages: {
                cs: LANG_PATH.cs,
                en: LANG_PATH.en,
                "x-default": LANG_PATH.cs,
            },
        },
        openGraph: {
            type: "profile",
            siteName: "Zdeněk Mazurák",
            title: c.title,
            description: c.description,
            url: LANG_PATH[lang],
            locale: c.locale,
            alternateLocale: [copy[other].locale],
            firstName: "Zdeněk",
            lastName: "Mazurák",
            username: "killov",
            images: [{url: OG_IMAGE, width: 1200, height: 630, alt: c.title}],
        },
        twitter: {
            card: "summary_large_image",
            title: c.title,
            description: c.description,
            images: [OG_IMAGE],
        },
        icons: {
            icon: [{url: "/favicon.svg", type: "image/svg+xml"}],
        },
        category: "technology",
    };
}

export const viewport: Viewport = {
    themeColor: [
        {media: "(prefers-color-scheme: dark)", color: "#0a0d12"},
        {media: "(prefers-color-scheme: light)", color: "#f4f5f7"},
    ],
    colorScheme: "dark light",
    width: "device-width",
    initialScale: 1,
};

/**
 * JSON-LD — ProfilePage s Person a projekty, které běží v produkci.
 * Google ho používá pro profilové stránky, AI agenti (WebFetch, crawlery…)
 * z něj čtou strukturovaný profil.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/profile-page
 */
function jsonLd(lang: Lang) {
    const c = copy[lang];
    const pageUrl = `${SITE_URL}${LANG_PATH[lang]}`;
    const current = experience.find((e) => e.to === null);
    const live = projects.filter((p) => p.href && p.kind !== "work");
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                url: `${SITE_URL}/`,
                name: "Zdeněk Mazurák",
                inLanguage: ["cs", "en"],
                publisher: {"@id": PERSON_ID},
            },
            {
                "@type": "ProfilePage",
                "@id": `${pageUrl}#page`,
                url: pageUrl,
                name: c.title,
                description: c.description,
                inLanguage: lang,
                isPartOf: {"@id": `${SITE_URL}/#website`},
                mainEntity: {"@id": PERSON_ID},
                primaryImageOfPage: `${SITE_URL}${OG_IMAGE}`,
            },
            {
                "@type": "Person",
                "@id": PERSON_ID,
                name: "Zdeněk Mazurák",
                givenName: "Zdeněk",
                familyName: "Mazurák",
                honorificPrefix: "Bc.",
                alternateName: "killov",
                url: `${SITE_URL}/`,
                image: PHOTO_URL,
                jobTitle: c.jobTitle,
                description: c.description,
                email: `mailto:${profile.emails[0]}`,
                address: {
                    "@type": "PostalAddress",
                    addressLocality: "Olomouc",
                    addressCountry: "CZ",
                },
                worksFor: current && {
                    "@type": "Organization",
                    name: current.company,
                    url: "https://www.worldee.com",
                },
                alumniOf: [
                    {"@type": "CollegeOrUniversity", name: "Univerzita Palackého v Olomouci", sameAs: "https://www.upol.cz"},
                    {"@type": "EducationalOrganization", name: "VOŠ a SPŠE Olomouc"},
                ],
                knowsLanguage: ["cs", "en"],
                knowsAbout: [
                    "PHP", "Nette Framework", "C#", ".NET", "TypeScript", "Node.js",
                    "React", "MobX", "Next.js", "Three.js",
                    "Docker", "AWS", "GitHub Actions",
                    "MySQL", "PostgreSQL", "Redis", "ScyllaDB",
                    "Claude Code", "MCP servers", "AI tools for developers",
                    "Backend engineering", "Software architecture",
                ],
                sameAs: [profile.github, profile.linkedin],
            },
            ...live.map((p) => ({
                "@type": p.kind === "game" ? "VideoGame" : p.kind === "oss" ? "SoftwareSourceCode" : "WebApplication",
                name: p.title,
                url: p.href,
                ...(p.kind === "game"
                    ? {gamePlatform: "Web browser", playMode: "MultiPlayer"}
                    : p.kind === "oss"
                        ? {programmingLanguage: "TypeScript", codeRepository: `${profile.github}/ironbean`}
                        : {applicationCategory: "DeveloperApplication", operatingSystem: "Web"}),
                author: {"@id": PERSON_ID},
            })),
        ],
    };
}

export function RootDocument({lang, children}: {lang: Lang; children: React.ReactNode}) {
    return (
        <html lang={lang} dir="ltr">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com"/>
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                {/* textura Země se stáhne souběžně s JS (three.js ji načítá s crossOrigin=anonymous) */}
                <link rel="preload" href="/textures/earth-1024.webp" as="image" type="image/webp" crossOrigin="anonymous" fetchPriority="high"/>
                <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt"/>
            </head>
            <body>
                <div className="root">
                    {children}
                </div>
                <script
                    id="ld-profile"
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd(lang))}}
                />
            </body>
        </html>
    );
}
