import React, {createContext, useCallback, useContext, useState} from "react";
import {LANG_PATH, Lang, t as translate} from "./i18n";

interface LanguageContextValue {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
    lang: "cs",
    setLang: () => {
        // noop default, replaced by provider
    },
    t: (key) => translate("cs", key),
});

/**
 * Jazyk určuje URL (/ = cs, /en/ = en), obě verze jsou předrenderované.
 * Přepnutí jen vymění texty a URL bez reloadu, ať se nerestartuje 3D scéna.
 */
export const LanguageProvider: React.FC<{initialLang: Lang; children: React.ReactNode}> = ({initialLang, children}) => {
    const [lang, setLangState] = useState<Lang>(initialLang);

    const setLang = useCallback((next: Lang) => {
        setLangState(next);
        document.documentElement.lang = next;
        window.history.replaceState(window.history.state, "", LANG_PATH[next] + window.location.hash);
    }, []);

    const t = useCallback(
        (key: string) => translate(lang, key),
        [lang],
    );

    return (
        <LanguageContext.Provider value={{lang, setLang, t}}>
            {children}
        </LanguageContext.Provider>
    );
};

export function useLanguage(): LanguageContextValue {
    return useContext(LanguageContext);
}
