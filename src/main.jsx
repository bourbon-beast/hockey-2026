import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import VotingPage from './components/VotingPage.jsx'
import PublicUnavailabilityForm from './components/PublicUnavailabilityForm.jsx'
import PublicPollPage from './components/PublicPollPage.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public no-auth voting route */}
        <Route path="/vote/:teamId/:roundKey" element={<VotingPage />} />
        {/* Public no-auth unavailability intake */}
        <Route path="/unavailable" element={<PublicUnavailabilityForm />} />
        {/* Public no-auth poll response */}
        <Route path="/poll/:pollId" element={<PublicPollPage />} />
        {/* Main app — catches everything else */}
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
