import type { CSSProperties } from 'react'
import HomePage from './pages/HomePage'

// The wood photo is optional: until assets/textures/wood-light.jpg exists this finds nothing,
// and the table keeps its warm fallback color from wood-background.css.
const woodTextureUrl = Object.values(
  import.meta.glob<string>('./assets/textures/wood-light.jpg', { eager: true, query: '?url', import: 'default' }),
)[0]

const woodStyle = woodTextureUrl ? ({ '--wood-texture': `url("${woodTextureUrl}")` } as CSSProperties) : undefined

export default function App() {
  return (
    <div className="wood-background" style={woodStyle}>
      <HomePage />
    </div>
  )
}
