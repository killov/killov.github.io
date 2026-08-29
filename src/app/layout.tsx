import "./App.css";

export const metadata = {
    title: 'Zdeněk Mazurák — Senior full-stack · Backend / Tech Lead',
    description:
        'Portfolio Zdeňka Mazuráka — senior full-stack a backend lead z Olomouce. PHP/Nette, C#/.NET, React/MobX, Next.js. Staví AI nástroje pro vývojáře (WorkMux). Open-source Ironbean (7⭐).',
    openGraph: {
        title: 'Zdeněk Mazurák — Senior full-stack · Backend / Tech Lead',
        description:
            'Backend lead ve Worldee, vlastní AI nástroje a open-source. 6+ let v produkci.',
        type: 'website',
        url: 'https://killov.github.io/',
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="cs">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com"/>
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <div className="root">
                    {children}
                </div>
            </body>
        </html>
    )
}