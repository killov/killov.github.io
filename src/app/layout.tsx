import "./App.css";
import type {Metadata, Viewport} from "next";

const SITE_URL = "https://killov.github.io";
const SITE_TITLE = "Zdeněk Mazurák — Senior full-stack · Backend / Tech Lead";
const SITE_DESCRIPTION =
    "Senior full-stack a backend lead z Olomouce. PHP/Nette, C#/.NET, React/MobX, Next.js. Staví AI nástroje pro vývojáře. Open-source Ironbean (7⭐). 6+ let v produkci.";

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: SITE_TITLE,
        template: "%s · Zdeněk Mazurák",
    },
    description: SITE_DESCRIPTION,
    applicationName: "Zdeněk Mazurák — Portfolio",
    authors: [{name: "Zdeněk Mazurák", url: SITE_URL}],
    generator: "Next.js",
    keywords: [
        "Zdeněk Mazurák",
        "killov",
        "full-stack developer",
        "backend lead",
        "tech lead",
        "PHP",
        "Nette",
        "C#",
        ".NET",
        "React",
        "MobX",
        "Next.js",
        "TypeScript",
        "Kubernetes",
        "AI tools for developers",
        "WorkMux",
        "Ironbean",
        "Olomouc",
        "Czech Republic",
    ],
    referrer: "origin-when-cross-origin",
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
        canonical: "/",
        languages: {
            "cs": "/?lang=cs",
            "en": "/?lang=en",
        },
    },
    openGraph: {
        type: "profile",
        siteName: "Zdeněk Mazurák",
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        locale: "cs_CZ",
        alternateLocale: ["en_US"],
        firstName: "Zdeněk",
        lastName: "Mazurák",
        username: "killov",
        gender: "male",
    },
    twitter: {
        card: "summary_large_image",
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        creator: "@killov",
    },
    icons: {
        icon: "/favicon.svg",
    },
    category: "technology",
};

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
 * JSON-LD Person schema — strojově čitelný popis profilu pro vyhledávače
 * i AI agenty (WebFetch, Crawl, GPT-Builder, Reader MCP…).
 *
 * @see https://schema.org/Person
 */
const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Zdeněk Mazurák",
    givenName: "Zdeněk",
    familyName: "Mazurák",
    alternateName: "killov",
    url: SITE_URL,
    image: `${SITE_URL}/bezec.jpg`,
    jobTitle: "Senior full-stack · Backend / Tech Lead",
    description: SITE_DESCRIPTION,
    email: "mailto:z.mazurak35@gmail.com",
    address: {
        "@type": "PostalAddress",
        addressLocality: "Olomouc",
        addressCountry: "CZ",
    },
    homeLocation: {
        "@type": "Place",
        name: "Olomouc, Czech Republic",
    },
    knowsLanguage: [
        { "@type": "Language", name: "Czech", alternateName: "cs" },
        { "@type": "Language", name: "English", alternateName: "en" },
    ],
    knowsAbout: [
        "PHP", "Nette Framework", "Latte", "PHPStan",
        "C#", ".NET", "ASP.NET",
        "TypeScript", "JavaScript", "Node.js",
        "React", "MobX", "Next.js", "SCSS",
        "Kubernetes", "Helm", "Docker", "Terraform",
        "AWS", "GitHub Actions", "Playwright",
        "MySQL", "PostgreSQL", "Redis", "ScyllaDB", "Prisma",
        "Stripe", "Gemini AI",
        "Claude Code", "MCP servers", "AI dev tools",
        "Software architecture", "Backend engineering", "Tech leadership",
    ],
    hasOccupation: {
        "@type": "Occupation",
        name: "Backend / Tech Lead",
        occupationLocation: {
            "@type": "City",
            name: "Olomouc, Czech Republic",
        },
        skills: [
            "PHP/Nette backend",
            "C#/.NET microservices",
            "React/MobX frontend",
            "Kubernetes / Helm",
            "AI tooling",
        ],
        experienceRequirements: "6+ years",
    },
    worksFor: {
        "@type": "Organization",
        name: "Worldee.com",
        url: "https://worldee.com",
    },
    alumniOf: [
        {
            "@type": "EducationalOrganization",
            name: "Univerzita Palackého v Olomouci",
            address: {
                "@type": "PostalAddress",
                addressLocality: "Olomouc",
                addressCountry: "CZ",
            },
        },
        {
            "@type": "EducationalOrganization",
            name: "VOŠ a SPŠE Olomouc",
            address: {
                "@type": "PostalAddress",
                addressLocality: "Olomouc",
                addressCountry: "CZ",
            },
        },
    ],
    sameAs: [
        "https://github.com/killov",
        "https://www.linkedin.com/in/zden%C4%9Bk-mazur%C3%A1k-582972162/",
    ],
    contactPoint: [
        {
            "@type": "ContactPoint",
            contactType: "professional",
            email: "z.mazurak35@gmail.com",
            availableLanguage: ["Czech", "English"],
        },
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="cs" dir="ltr">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com"/>
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                <link rel="alternate" hrefLang="cs" href={`${SITE_URL}/?lang=cs`}/>
                <link rel="alternate" hrefLang="en" href={`${SITE_URL}/?lang=en`}/>
                <link rel="alternate" hrefLang="x-default" href={SITE_URL}/>
            </head>
            <body>
                <div className="root">
                    {children}
                </div>
                <script
                    id="ld-person"
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
                />
            </body>
        </html>
    )
}
