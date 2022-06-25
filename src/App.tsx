import React from 'react'
import style from "./style.module.less";
import bezec from './bezec.jpg'
import up from './up.png'
import spse from './spse.png'
import {Icon, IIconProps} from "./icons/icon";


function App() {
  return (
    <div className={style.layout}>
      <div className={style.left}>
        <div className={style.user}>
            <img src={bezec} className={style.photo}></img>
            <h2 className={style.name}>Zdeněk Mazurák</h2>
            <h3 className={style.title}>Fullstack web developer</h3>
            <div className={style.socialBar}>
                <SocialIcon name={"facebook"} link={"https://www.facebook.com/zdenek.mazurak.56"} />
                <SocialIcon name={"instagram"} link={"https://www.instagram.com/killovcz/"} />
                <SocialIcon name={"linkedin"} link={"https://www.linkedin.com/in/zden%C4%9Bk-mazur%C3%A1k-582972162/"} />
                <SocialIcon name={"github"} link={"https://github.com/killov"} />
            </div>
        </div>
      </div>
        <div className={style.right}>
            <h2>Education</h2>

            <div className={style.educationTable}>
                <Radek
                    fromYear={2019}
                    toYear={2015}
                    logoSrc={up}
                    title={"Bc. Informatics"}
                    subTitle={"Palacký University in Olomouc"}
                />
                <Radek
                    fromYear={2015}
                    toYear={2011}
                    logoSrc={spse}
                    title={"Electrotechnics"}
                    subTitle={"VOŠ a SPŠE Olomouc"}
                />
            </div>
        </div>
    </div>
  )
}


interface IRadekProps {
    fromYear: number;
    toYear: number;
    logoSrc: string;
    title: string;
    subTitle: string;
}

const Radek: React.FC<IRadekProps> = (props) => {
    return (
        <div className={style.educationTableRow}>
            <div className={style.year}>
                <div className={style.from}>{props.fromYear}</div>
                <div className={style.to}>{props.toYear}</div>
            </div>
            <div className={style.logo}>
                <img src={props.logoSrc} />
            </div>
            <div className={style.desc}>
                <div className={style.title}>{props.title}</div>
                <div className={style.sub}>{props.subTitle}</div>
            </div>
        </div>
    );

}

interface ISocialIconProps extends IIconProps {
    link: string;
}

const SocialIcon: React.FC<ISocialIconProps> = (props) => {
    return (
        <a className={style.socialIcon} href={props.link} target={"_blank"}>
            <Icon {...props}  />
        </a>
    );

}

export default App
