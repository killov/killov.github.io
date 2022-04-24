import React from 'react'
import style from "./style.module.less";


function App() {
  return (
    <div className={style.layout}>
      <div className={style.left}>
        <div className={style.user}>
            <img src={"https://picsum.photos/id/237/200/300"} className={style.photo}></img>
            <h2 className={style.name}>Zdeněk Mazurák</h2>
        </div>
      </div>
    </div>
  )
}

export default App
