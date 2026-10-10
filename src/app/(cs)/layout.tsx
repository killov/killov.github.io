import {RootDocument, buildMetadata} from "../seo";

export const metadata = buildMetadata("cs");
export {viewport} from "../seo";

export default function Layout({children}: {children: React.ReactNode}) {
    return <RootDocument lang="cs">{children}</RootDocument>;
}
