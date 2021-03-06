declare module "*.module.less" {
    const content: {
        [key: string]: string
    };
    export default content;
}

declare module "*.jpg" {
    const content: string;
    export default content;
}

declare module "*.png" {
    const content: string;
    export default content;
}