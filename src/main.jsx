import { createRoot } from 'react-dom/client'
import '@fontsource-variable/golos-text'
import App from './App.jsx'
import './styles.css'

// Block right-click menu and image drag-out ("Save image as…"). Downloads go through the copyright modal.
addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('dragstart', (e) => e.target.tagName === 'IMG' && e.preventDefault())

createRoot(document.getElementById('root')).render(<App />)
