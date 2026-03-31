import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppHeader from './components/Header/Header';
import Navigation from './components/Navigation/Navigation';
import Dashboard from './pages/Dashboard/Dashboard';
import Backbones from './pages/Network/Backbones/Backbones';
import BackboneDetail from './pages/Network/Backbones/BackboneDetail';
import SiteDetail from './pages/Network/Backbones/SiteDetail';
import VANs from './pages/Network/VANs/VANs';
import TLS from './pages/Network/TLS/TLS';

function App() {
  const [isSideNavExpanded] = useState(true);

  return (
    <Router>
      <div className="app-container">
        <AppHeader />
        <div className="app-content">
          <Navigation isOpen={isSideNavExpanded} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/backbones" element={<Backbones />} />
              <Route path="/backbones/:backboneId" element={<BackboneDetail />} />
              <Route path="/backbones/:backboneId/sites/:siteId" element={<SiteDetail />} />
              <Route path="/vans" element={<VANs />} />
              <Route path="/tls" element={<TLS />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;

// Made with Bob
