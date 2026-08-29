"use client"

import React, {useEffect, useId, useRef} from "react"
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

function useRevealOnScroll(): React.RefObject<HTMLDivElement> {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReducedMotion) {
            node.classList.add(style.revealed);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    entry.target.classList.add(style.revealed);
                    observer.unobserve(entry.target);
                }
            }
        }, {threshold: 0.1});
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return ref;
}

const MachineReadableProfile: React.FC = () => {
    const {t} = useLanguage();
    return (
        <section aria-hidden="true" data-ai-summary="true" className={style.aiSummary}>
            <h2>{t("ai.heading")}</h2>
            <p>
                <strong>Jméno:</strong> Zdeněk Mazurák (killov).{" "}
                <strong>Role:</strong> {t("hero.role")}.{" "}
                <strong>Lokalita:</strong> {t("contact.location.value")}.
            </p>
            <p>
                <strong>Zkušenosti:</strong> 6+ let v produkci. Backend a tech lead ve Worldee.com od 2019.{" "}
                <strong>Expert:</strong> PHP 8.4, Nette, TypeScript, Kubernetes, Helm.{" "}
                <strong>Strong:</strong> C#/.NET, React, MobX, Next.js, AWS, Docker, Terraform, MySQL, PostgreSQL, Redis, ScyllaDB.
            </p>
            <p>
                <strong>Vlastní projekty:</strong> WorkMux (AI orchestrátor pro vývojáře), Ironbean (DI knihovna, 7⭐).
            </p>
            <p>
                <strong>Kontakt:</strong> z.mazurak35@gmail.com · github.com/killov.{" "}
                <strong>Dostupnost:</strong> {t("contact.subtitle")}
            </p>
        </section>
    );
};

const RevealSection: React.FC<{
    children: React.ReactNode;
    className?: string;
    id?: string;
    label?: string;
}> = ({children, className, id, label}) => {
    const ref = useRevealOnScroll();
    const reactId = useId();
    const sectionId = id ?? `section-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
    return (
        <section
            ref={ref}
            id={sectionId}
            data-section={label}
            aria-label={label}
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
            <button type="button" className={`${style.langBtn} ${lang === "cs" ? style.langBtnActive : ""}`} onClick={onPick("cs")} aria-pressed={lang === "cs"} data-lang="cs">CZ</button>
            <span className={style.langDivider} aria-hidden="true">|</span>
            <button type="button" className={`${style.langBtn} ${lang === "en" ? style.langBtnActive : ""}`} onClick={onPick("en")} aria-pressed={lang === "en"} data-lang="en">EN</button>
        </div>
    );
};

const Nav: React.FC = () => {
    const items: Array<{href: string; key: string}> = [
        {href: "#about", key: "nav.about"},
        {href: "#stack", key: "nav.stack"},
        {href: "#projects", key: "nav.projects"},
        {href: "#experience", key: "nav.experience"},
        {href: "#education", key: "nav.education"},
        {href: "#contact", key: "nav.contact"},
    ];
    const {t} = useLanguage();
    return (
        <nav className={style.nav} aria-label="Sekce webu">
            <a href="#main" className={style.navBrand}>
                <span className={style.navBrandMark} aria-hidden="true">/</span>
                <span className={style.navBrandName}>killov</span>
            </a>
            <ul className={style.navList}>
                {items.map((item) => (
                    <li key={item.href}>
                        <a className={style.navLink} href={item.href}>{t(item.key)}</a>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

const Hero: React.FC = () => {
    const {t} = useLanguage();
    return (
        <header className={style.hero} role="banner" data-section="hero">
            <div className={style.heroInner}>
                <p className={style.heroEyebrow}>
                    <span className={style.heroDot} aria-hidden="true"/>
                    {t("hero.availability")}
                </p>
                <h1 className={style.heroName}>Zdeněk Mazurák</h1>
                <p className={style.heroRole}>{t("hero.role")}</p>
                <p className={style.heroTagline}>{t("hero.tagline")}</p>
                <div className={style.heroCta}>
                    <a className={style.btnPrimary} href={`mailto:${profile.emails[0]}`}>{t("hero.cta.contact")}</a>
                    <a className={style.btnGhost} href={profile.github} target="_blank" rel="noreferrer">
                        {t("hero.cta.github")} <span aria-hidden="true">→</span>
                    </a>
                </div>
            </div>
            <div className={style.heroPhotoWrap}>
                <img src={bezec.src} className={style.heroPhoto} alt="Zdeněk Mazurák" width={280} height={280} loading="eager" decoding="async"/>
            </div>
        </header>
    );
};

const About: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection id="about" className={style.about} label={t("about.title")}>
            <div className={style.sectionHead}>
                <span className={style.sectionIndex} aria-hidden="true">01</span>
                <h2 className={style.h2}>{t("about.title")}</h2>
            </div>
            <div className={style.aboutGrid}>
                <div className={style.aboutCopy}>
                    <p>{t(about.paragraphKeys[0])}</p>
                    <p>{t(about.paragraphKeys[1])}</p>
                </div>
                <dl className={style.statGrid}>
                    {about.stats.map((stat) => (
                        <div key={stat.labelKey} className={style.statCard}>
                            <dt className={style.statValue}>{stat.value}</dt>
                            <dd className={style.statLabel}>{t(stat.labelKey)}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </RevealSection>
    );
};

const Stack: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection id="stack" className={style.stack} label={t("stack.title")}>
            <div className={style.sectionHead}>
                <span className={style.sectionIndex} aria-hidden="true">02</span>
                <h2 className={style.h2}>{t("stack.title")}</h2>
            </div>
            <p className={style.subtitle}>{t("stack.subtitle")}</p>
            <div className={style.stackGrid}>
                {stack.map((cat) => (
                    <div key={cat.titleKey} className={style.stackCategory}>
                        <div className={style.stackHeader}>
                            <h3 className={style.stackTitle}>{t(cat.titleKey)}</h3>
                            <span className={`${style.stackLevel} ${cat.level === "expert" ? style.stackLevelExpert : style.stackLevelStrong}`}>
                                {t(cat.level === "expert" ? "stack.level.expert" : "stack.level.strong")}
                            </span>
                        </div>
                        <ul className={style.tagWrap}>
                            {cat.tags.map((tag) => (
                                <li key={tag} className={style.tag}>{tag}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </RevealSection>
    );
};

const Projects: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection id="projects" className={style.projects} label={t("projects.title")}>
            <div className={style.sectionHead}>
                <span className={style.sectionIndex} aria-hidden="true">03</span>
                <h2 className={style.h2}>{t("projects.title")}</h2>
            </div>
            <p className={style.subtitle}>{t("projects.subtitle")}</p>
            <div className={style.projectsGrid}>
                {projects.map((p) => (
                    <article key={p.title} className={style.projectCard} data-project-kind={p.kind}>
                        <div className={style.projectHeader}>
                            <h3 className={style.projectTitle}>{p.title}</h3>
                            <span className={`${style.projectKind} ${p.kind === "work" ? style.projectKindWork : p.kind === "oss" ? style.projectKindOss : style.projectKindAi}`}>
                                {t(p.kind === "work" ? "projects.kind.work" : p.kind === "oss" ? "projects.kind.oss" : "projects.kind.ai")}
                            </span>
                        </div>
                        <p className={style.projectDesc}>{t(p.descKey)}</p>
                        <ul className={style.tagWrap}>
                            {p.tags.map((tag) => (
                                <li key={tag} className={style.tag}>{tag}</li>
                            ))}
                        </ul>
                        {p.href && (
                            <a className={style.projectLink} href={p.href} target="_blank" rel="noreferrer">
                                {t("projects.visit")} <span aria-hidden="true">→</span>
                            </a>
                        )}
                    </article>
                ))}
            </div>
        </RevealSection>
    );
};

const ExperienceTimeline: React.FC = () => {
    const {t} = useLanguage();
    const presentLabel = t("common.present");
    return (
        <RevealSection id="experience" className={style.experience} label={t("experience.title")}>
            <div className={style.sectionHead}>
                <span className={style.sectionIndex} aria-hidden="true">04</span>
                <h2 className={style.h2}>{t("experience.title")}</h2>
            </div>
            <ol className={style.timeline}>
                {experience.map((entry) => (
                    <li key={entry.company} className={style.timelineRow}>
                        <div className={style.timelineYear}>
                            <time dateTime={`${entry.from}-01-01`}>{entry.from}</time>
                            <span aria-hidden="true"> – </span>
                            {entry.to ? (
                                <time dateTime={`${entry.to}-12-31`}>{entry.to}</time>
                            ) : (
                                <span className={style.timelinePresent}>{presentLabel}</span>
                            )}
                        </div>
                        <div className={style.timelineLogo}>
                            <img src={entry.company === "Worldee.com" ? worldeeLogo.src : quadientLogo.src} alt={entry.logoAlt} width={64} height={64} loading="lazy" decoding="async"/>
                        </div>
                        <div className={style.timelineBody}>
                            <h3 className={style.timelineTitle}>{entry.title}</h3>
                            <div className={style.timelineCompany}>
                                <span className={style.visuallyHidden}>Společnost: </span>
                                {entry.company}
                            </div>
                            <p className={style.timelineDesc}>{t(entry.descKey)}</p>
                        </div>
                    </li>
                ))}
            </ol>
        </RevealSection>
    );
};

const EducationTimeline: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection id="education" className={style.education} label={t("education.title")}>
            <div className={style.sectionHead}>
                <span className={style.sectionIndex} aria-hidden="true">05</span>
                <h2 className={style.h2}>{t("education.title")}</h2>
            </div>
            <ol className={style.timeline}>
                {education.map((entry) => (
                    <li key={entry.school} className={style.timelineRow}>
                        <div className={style.timelineYear}>
                            <time dateTime={`${entry.from}-01-01`}>{entry.from}</time>
                            <span aria-hidden="true"> – </span>
                            <time dateTime={`${entry.to}-12-31`}>{entry.to}</time>
                        </div>
                        <div className={style.timelineLogo}>
                            <img src={entry.school.includes("Palackého") ? upLogo.src : spseLogo.src} alt={entry.school} width={64} height={64} loading="lazy" decoding="async"/>
                        </div>
                        <div className={style.timelineBody}>
                            <h3 className={style.timelineTitle}>{entry.title}</h3>
                            <div className={style.timelineCompany}>
                                <span className={style.visuallyHidden}>Škola: </span>
                                {entry.school}
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </RevealSection>
    );
};

const Contact: React.FC = () => {
    const {t} = useLanguage();
    return (
        <RevealSection id="contact" className={style.contact} label={t("contact.title")}>
            <div className={style.sectionHead}>
                <span className={style.sectionIndex} aria-hidden="true">06</span>
                <h2 className={style.h2}>{t("contact.title")}</h2>
            </div>
            <p className={style.subtitle}>{t("contact.subtitle")}</p>
            <div className={style.contactGrid}>
                <div className={style.contactCard} data-contact="email">
                    <div className={style.contactLabel}>{t("contact.email.label")}</div>
                    <div className={style.contactValues}>
                        {profile.emails.map((email) => (
                            <a key={email} className={style.contactLink} href={`mailto:${email}`}>{email}</a>
                        ))}
                    </div>
                </div>
                <div className={style.contactCard} data-contact="github">
                    <div className={style.contactLabel}>{t("contact.github.label")}</div>
                    <a className={style.contactLink} href={profile.github} target="_blank" rel="noreferrer">github.com/killov</a>
                </div>
                <div className={style.contactCard} data-contact="linkedin">
                    <div className={style.contactLabel}>{t("contact.linkedin.label")}</div>
                    <a className={style.contactLink} href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
                </div>
                <div className={style.contactCard} data-contact="location">
                    <div className={style.contactLabel}>{t("contact.location.label")}</div>
                    <div className={style.contactValue}>{t("contact.location.value")}</div>
                </div>
            </div>
        </RevealSection>
    );
};

const TopBar: React.FC = () => (
    <div className={style.topBar}>
        <LangSwitch/>
    </div>
);

function AppInner() {
    return (
        <div className={style.layout}>
            <TopBar/>
            <Nav/>
            <main id="main" className={style.main}>
                <Hero/>
                <About/>
                <Stack/>
                <Projects/>
                <ExperienceTimeline/>
                <EducationTimeline/>
                <Contact/>
                <MachineReadableProfile/>
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
