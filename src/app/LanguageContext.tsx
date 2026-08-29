import React, {createContext, useCallback, useContext, useEffect, useState} from "react";
import {Lang, t as translate} from "./i18n";

const STORAGE_KEY = "zdenek.lang";

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

export const LanguageProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    // Výchozí cs, aby se render shodoval se SSR (žádný hydration mismatch).
    const [lang, setLangState] = useState<Lang>("cs");

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (stored === "cs" || stored === "en") {
                setLangState(stored);
            }
        } catch {
            // localStorage může být nedostupný (privátní režim, SSR-only) — ignoruj.
        }
    }, []);

    const setLang = useCallback((next: Lang) => {
        setLangState(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // viz výše
        }
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