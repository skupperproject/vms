import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppHeader from './components/Header/Header';
import Navigation from './components/Navigation/Navigation';
import Dashboard from './pages/Dashboard/Dashboard';
import Backbones from './pages/Network/Backbones/Backbones';
import BackboneContext from './pages/Network/Backbones/BackboneContext';
import BackboneDetail from './pages/Network/Backbones/BackboneDetail';
import SiteDetail from './pages/Network/Backbones/SiteDetail';
import VANs from './pages/Network/VANs/VANs';
import TLS from './pages/Network/TLS/TLS';
import Library from './pages/Compose/Library/Library';
import Applications from './pages/Compose/Applications/Applications';

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
              <Route path="/network/backbones" element={<Backbones />} />
              <Route path="/network/backbones/:backboneId" element={<BackboneContext />}>
                <Route index element={<BackboneDetail />} />
                <Route path="sites/:siteId" element={<SiteDetail />} />
              </Route>
              <Route path="/network/vans" element={<VANs />} />
              <Route path="/network/tls" element={<TLS />} />
              <Route path="/compose/library" element={<Library />} />
              <Route path="/compose/applications" element={<Applications />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;

// Made with Bob
