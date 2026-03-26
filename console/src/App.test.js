import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function SimpleApp() {
  return (
    <Router>
      <div style={{ padding: '20px', backgroundColor: '#f4f4f4', minHeight: '100vh' }}>
        <h1>VMS Console Test</h1>
        <p>If you can see this, React is working!</p>
        <Routes>
          <Route path="/" element={<div><h2>Dashboard</h2><p>Dashboard content</p></div>} />
        </Routes>
      </div>
    </Router>
  );
}

export default SimpleApp;

// Made with Bob
