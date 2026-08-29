"use client"

import React, {useEffect, useRef} from "react"
import style from './style.module.scss';
import bezec from './bezec.jpg'
import worldeeLogo from "./img/worldee_com_logo.jpg"
import quadientLogo from "./img/quadient_logo.jpg"
import upLogo from './up.png'
import spseLogo from './spse.png'
import {LanguageProvider, useLanguage} from "./LanguageContext";
import {Lang} from "./i18n";
import {
    about,
    education,
    experience,
    profile,
    projects,
    stack,
} from "./data/profile";

/**
 * Hook: animuje reveal sekcí při scrollu.
 * Sleduje IntersectionObserver a přidává třídu `style.revealed`, jakmile
 * je sekce aspoň 10 % vidět. Respektuje `prefers-reduced-motion`.
 */
function useRevealOnScroll(): React.RefObject<HTMLDivElement> {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        if (prefersReducedMotion) {
            node.classList.add(style.revealed);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add(style.revealed);
                        observer.unobserve(entry.target);
                    }
                }
            },
            {threshold: 0.1},
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return ref;
}

const RevealSection: React.FC<{children: React.ReactNode; className?: string}> = ({children, className}) => {
    const ref = useRevealOnScroll();
    return (
        <section
            ref={ref}
            className={`${style.section} ${className ?? ""} ${style.reveal}`}
        >
            {children}
        </section>
    );
};

const LangSwitch: React.FC = () => {
    const {lang, setLang} = useLanguage();
    const onPick = (next: Lang) => () => setLang(next);
    return (
        <div className={style.langSwitch} role="group" aria-label="Language">
            <button
                type="button"
                className={`${style.langBtn} ${lang === "cs" ? style.langBtnActive : ""}`}
                onClick={onPick("cs")}
                aria-pressed={lang === "cs"}
            >
                CZ
            </button>
            <span className={style.langDivider} aria-hidden="true">|</span>
            <button
                type="button"
                className={`${style.langBtn} ${lang === "en" ? style.langBtnActive : ""}`}
                onClick={onPick("en")}
                aria-pressed={lang === "en"}
            >
                EN
            </button>
        </div>
    );
};

const Hero: React.FC = () => {
    const {t} = useLanguage();
    return (
        <section className={style.hero}>
            <div className={style.heroInner}>
                <h1 className={style.heroName}>Zdeněk Mazurák</h1>
                <p className={style.heroRole}>{t("hero.role")}</p>
                <p className={style.heroTagline}>{t("hero.tagline")}</p>
                <div className={style.heroCta}>
                    <a className={style.btnPrimary} href={`mailto:${profile.emails[0]}`}>
                        {t("hero.cta.contact")}
                    </a>
                    <a
                        className={style.btnGhost}
                        href={profile.github}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t("hero.cta.github")} →
                    </a>
                </div>
            </div>
            <div className={style.heroPhotoWrap}>
                <img src={bezec.src} className={style.heroPhoto} alt="Zdeněk Mazurák"/>
            </div>
        </section>
    );
};

const About: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection className={style.about}>
            <h2 className={style.h2}>{t("about.title")}</h2>
            <div className={style.aboutGrid}>
                <div className={style.aboutCopy}>
                    <p>{t(about.paragraphKeys[0])}</p>
                    <p>{t(about.paragraphKeys[1])}</p>
                </div>
                <div className={style.statGrid}>
                    {about.stats.map((stat) => (
                        <div key={stat.labelKey} className={style.statCard}>
                            <div className={style.statValue}>{stat.value}</div>
                            <div className={style.statLabel}>{t(stat.labelKey)}</div>
                        </div>
                    ))}
                </div>
            </div>
        </RevealSection>
    );
};

const Stack: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection className={style.stack}>
            <h2 className={style.h2}>{t("stack.title")}</h2>
            <p className={style.subtitle}>{t("stack.subtitle")}</p>
            <div className={style.stackGrid}>
                {stack.map((cat) => (
                    <div key={cat.titleKey} className={style.stackCategory}>
                        <div className={style.stackHeader}>
                            <h3 className={style.stackTitle}>{t(cat.titleKey)}</h3>
                            <span
                                className={`${style.stackLevel} ${cat.level === "expert" ? style.stackLevelExpert : style.stackLevelStrong}`}
                            >
                                {t(cat.level === "expert" ? "stack.level.expert" : "stack.level.strong")}
                            </span>
                        </div>
                        <div className={style.tagWrap}>
                            {cat.tags.map((tag) => (
                                <span key={tag} className={style.tag}>{tag}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </RevealSection>
    );
};

const Projects: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection className={style.projects}>
            <h2 className={style.h2}>{t("projects.title")}</h2>
            <p className={style.subtitle}>{t("projects.subtitle")}</p>
            <div className={style.projectsGrid}>
                {projects.map((p) => (
                    <article key={p.title} className={style.projectCard}>
                        <div className={style.projectHeader}>
                            <h3 className={style.projectTitle}>{p.title}</h3>
                            <span
                                className={`${style.projectKind} ${p.kind === "work" ? style.projectKindWork : p.kind === "oss" ? style.projectKindOss : style.projectKindAi}`}
                            >
                                {t(p.kind === "work" ? "projects.kind.work" : p.kind === "oss" ? "projects.kind.oss" : "projects.kind.ai")}
                            </span>
                        </div>
                        <p className={style.projectDesc}>{t(p.descKey)}</p>
                        <div className={style.tagWrap}>
                            {p.tags.map((tag) => (
                                <span key={tag} className={style.tag}>{tag}</span>
                            ))}
                        </div>
                        {p.href && (
                            <a
                                className={style.projectLink}
                                href={p.href}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {t("projects.visit")} →
                            </a>
                        )}
                    </article>
                ))}
            </div>
        </RevealSection>
    );
};

const ExperienceTimeline: React.FC = () => {
    const {t, lang} = useLanguage();
    const presentLabel = t("common.present");
    const fromLabel = t("common.from");
    const toLabel = t("common.to");
    return (
        <RevealSection className={style.experience}>
            <h2 className={style.h2}>{t("experience.title")}</h2>
            <div className={style.timeline}>
                {experience.map((entry) => (
                    <div key={entry.company} className={style.timelineRow}>
                        <div className={style.timelineYear}>
                            <div>{fromLabel} {entry.from}</div>
                            <div className={style.timelineYearTo}>
                                {toLabel} {entry.to ?? presentLabel}
                            </div>
                        </div>
                        <div className={style.timelineLogo}>
                            <img
                                src={entry.company === "Worldee.com" ? worldeeLogo.src : quadientLogo.src}
                                alt={entry.logoAlt}
                            />
                        </div>
                        <div className={style.timelineBody}>
                            <div className={style.timelineTitle}>{entry.title}</div>
                            <div className={style.timelineCompany}>{entry.company}</div>
                            <p className={style.timelineDesc}>{t(entry.descKey)}</p>
                        </div>
                    </div>
                ))}
            </div>
        </RevealSection>
    );
};

const EducationTimeline: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection className={style.education}>
            <h2 className={style.h2}>{t("education.title")}</h2>
            <div className={style.timeline}>
                {education.map((entry) => (
                    <div key={entry.school} className={style.timelineRow}>
                        <div className={style.timelineYear}>
                            <div>{entry.from} – {entry.to}</div>
                        </div>
                        <div className={style.timelineLogo}>
                            <img
                                src={entry.school.includes("Palackého") ? upLogo.src : spseLogo.src}
                                alt={entry.school}
                            />
                        </div>
                        <div className={style.timelineBody}>
                            <div className={style.timelineTitle}>{entry.title}</div>
                            <div className={style.timelineCompany}>{entry.school}</div>
                        </div>
                    </div>
                ))}
            </div>
        </RevealSection>
    );
};

const Contact: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection className={style.contact}>
            <h2 className={style.h2}>{t("contact.title")}</h2>
            <p className={style.subtitle}>{t("contact.subtitle")}</p>
            <div className={style.contactGrid}>
                <div className={style.contactCard}>
                    <div className={style.contactLabel}>{t("contact.email.label")}</div>
                    <div className={style.contactValues}>
                        {profile.emails.map((email) => (
                            <a key={email} className={style.contactLink} href={`mailto:${email}`}>
                                {email}
                            </a>
                        ))}
                    </div>
                </div>
                <div className={style.contactCard}>
                    <div className={style.contactLabel}>{t("contact.github.label")}</div>
                    <a className={style.contactLink} href={profile.github} target="_blank" rel="noreferrer">
                        github.com/killov →
                    </a>
                </div>
                <div className={style.contactCard}>
                    <div className={style.contactLabel}>{t("contact.linkedin.label")}</div>
                    <a className={style.contactLink} href={profile.linkedin} target="_blank" rel="noreferrer">
                        LinkedIn →
                    </a>
                </div>
                <div className={style.contactCard}>
                    <div className={style.contactLabel}>{t("contact.location.label")}</div>
                    <div className={style.contactValue}>{t("contact.location.value")}</div>
                </div>
            </div>
        </RevealSection>
    );
};

const TopBar: React.FC = () => {
    return (
        <div className={style.topBar}>
            <LangSwitch/>
        </div>
    );
};

function AppInner() {
    return (
        <div className={style.layout}>
            <TopBar/>
            <main className={style.main}>
                <Hero/>
                <About/>
                <Stack/>
                <Projects/>
                <ExperienceTimeline/>
                <EducationTimeline/>
                <Contact/>
                <footer className={style.footer}>
                    <span>© Zdeněk Mazurák · {new Date().getFullYear()}</span>
                    <span className={style.footerMeta}>killov.github.io</span>
                </footer>
            </main>
        </div>
    );
}

function App() {
    return (
        <LanguageProvider>
            <AppInner/>
        </LanguageProvider>
    );
}

export default App