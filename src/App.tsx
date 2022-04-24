import React from 'react'
import style from "./style.module.less";
import bezec from './bezec.jpg'


function App() {
  return (
    <div className={style.layout}>
      <div className={style.left}>
        <div className={style.user}>
            <img src={bezec} className={style.photo}></img>
            <h2 className={style.name}>Zdeněk Mazurák</h2>
            <h3 className={style.title}>Fullstack web developer</h3>
        </div>
      </div>
    </div>
  )
}

export default App
