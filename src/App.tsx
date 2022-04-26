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
                <div className={style.educationTableRow}>
                    <div className={style.year}>
                        <div className={style.from}>2019</div>
                        <div className={style.to}>2015</div>
                    </div>
                    <div className={style.logo}>
                        <img src={up} />
                    </div>
                    <div className={style.desc}>
                        <div className={style.title}>Bc. Informatics</div>
                        <div className={style.sub}>Palacký University in Olomouc</div>
                    </div>
                </div>
                <div className={style.educationTableRow}>
                    <div className={style.year}>
                        <div className={style.from}>2015</div>
                        <div className={style.to}>2011</div>
                    </div>
                    <div className={style.logo}>
                        <img src={spse} />
                    </div>
                    <div className={style.desc}>
                        <div className={style.title}>Electrotechnics</div>
                        <div className={style.sub}>VOŠ a SPŠE Olomouc</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
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
