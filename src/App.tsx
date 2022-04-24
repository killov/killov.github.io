import React from 'react'
import { useState } from 'react'
import logo from './logo.svg'
import './App.css'
import {autowired, component } from 'ironbean'
import { useBean } from 'ironbean-react'

@component
class B {

}

@component
class A {
   @autowired b!: B;
}

function App() {
  const [count, setCount] = useState(0)
  const a = useBean(A);

  console.log(a.b)

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>ČAUKY</p>
        <p>
          <button type="button"  className={""} onClick={() => setCount((count) => count + 1)}>
            count is: {count}
          </button>
        </p>
        <p>
          Edit <code>App.tsx</code> and save to test HMR updates.
        </p>
        <p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
          {' | '}
          <a
            className="App-link"
            href="https://vitejs.dev/guide/features.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vite Docs
          </a>
        </p>
      </header>
    </div>
  )
}

export default App
