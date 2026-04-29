import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { readEmbeddedProject } from '@/domain/embeddedProject'
import { usePlanningStore } from '@/store/planningStore'
import './index.css'

const embedded = readEmbeddedProject(document)
if (embedded) {
  usePlanningStore.getState().loadProject(embedded)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
