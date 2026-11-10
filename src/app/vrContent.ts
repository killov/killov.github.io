import {about, education, experience, profile, projects, stack} from "./data/profile";
import type {VrPanel} from "./scene/vr";

/** CV pro VR: stejný obsah jako panely webu, jen jako bloky textu na plátno */
export function vrPanels(t: (key: string) => string): VrPanel[] {
    const period = (from: number, to: number | null) => `${from} — ${to ?? t("common.present")}`;
    return [
        {
            title: "Bc. Zdeněk Mazurák",
            blocks: [
                {kind: "lead", text: t("hero.role")},
                {kind: "text", text: t("hero.tagline")},
                {kind: "gap"},
                {kind: "head", text: t("hero.availability")},
                {kind: "gap"},
                {kind: "text", text: t("vr.hint")},
            ],
        },
        {
            title: t("about.title"),
            blocks: [
                {kind: "text", text: t(about.paragraphKeys[0])},
                {kind: "text", text: t(about.paragraphKeys[1])},
                {kind: "gap"},
                {kind: "stats", items: about.stats.map((s) => ({value: s.value, label: t(s.labelKey)}))},
            ],
        },
        {
            title: t("stack.title"),
            blocks: [
                {kind: "text", text: t("stack.subtitle")},
                ...stack.flatMap((c) => [
                    {kind: "head" as const, text: t(c.titleKey), meta: t(`stack.level.${c.level}`)},
                    {kind: "tags" as const, tags: c.tags},
                ]),
            ],
        },
        {
            title: t("projects.title"),
            blocks: projects.flatMap((p) => [
                {kind: "head" as const, text: p.title, meta: t(`projects.kind.${p.kind}`)},
                {kind: "text" as const, text: t(p.descKey)},
            ]),
        },
        {
            title: `${t("experience.title")} · ${t("education.title")}`,
            blocks: [
                ...experience.flatMap((e) => [
                    {kind: "head" as const, text: `${e.title} · ${e.company}`, meta: period(e.from, e.to)},
                    {kind: "text" as const, text: t(e.descKey)},
                ]),
                {kind: "gap"},
                ...education.map((e) => ({kind: "head" as const, text: `${e.title} · ${e.school}`, meta: period(e.from, e.to)})),
            ],
        },
        {
            title: t("contact.title"),
            blocks: [
                {kind: "lead", text: t("contact.subtitle")},
                {kind: "gap"},
                {kind: "head", text: t("contact.email.label"), meta: profile.emails[0]},
                {kind: "head", text: t("contact.github.label"), meta: profile.github.replace("https://", "")},
                {kind: "head", text: t("contact.linkedin.label"), meta: "linkedin.com/in/zdeněk-mazurák"},
                {kind: "head", text: t("contact.location.label"), meta: t("contact.location.value")},
            ],
        },
    ];
}
