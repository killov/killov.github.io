import {RootDocument, buildMetadata} from "../../seo";

export const metadata = buildMetadata("en");
export {viewport} from "../../seo";

export default function Layout({children}: {children: React.ReactNode}) {
    return <RootDocument lang="en">{children}</RootDocument>;
}
