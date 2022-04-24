import React from "react";
import "./icoMoon.less";

export interface IIconProps {
    name: string;
}

export const Icon: React.FC<IIconProps> = (props) => {
    return <i className={"icon-"+props.name} style={{color: "white"}}></i>
}