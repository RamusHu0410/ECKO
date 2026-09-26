import type { CSSProperties } from 'react'
import HomePage from './pages/HomePage'
import woodPhoto from './assets/textures/MapleWood.avif'

const woodStyle = { '--wood-photo': `url("${woodPhoto}")` } as CSSProperties

export default function App() {
  return (
    <div className="wood-background" style={woodStyle}>
      <HomePage />
    </div>
  )
}
