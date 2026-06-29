import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './lib/auth.jsx'
import App from './App.jsx'
import './styles/app.css'
import { loadTheme } from './lib/themes.js'

loadTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
