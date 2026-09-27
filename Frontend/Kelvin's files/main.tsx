import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design/global.css'
import App from './App'
import { applyBackdrop, savedBackdrop } from './design/backdrops'

applyBackdrop(savedBackdrop()) // the background picked on the Profile page, before anything shows

const root = document.getElementById('root')
if (!root) throw new Error('index.html is missing the #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
