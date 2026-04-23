import React from 'react';

function SimpleApp() {
  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#f4f4f4', 
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ color: '#000' }}>VMS Console - Simple Test</h1>
      <p style={{ color: '#333' }}>If you can see this text, React is working!</p>
      <div style={{ 
        backgroundColor: '#fff', 
        padding: '20px', 
        marginTop: '20px',
        border: '1px solid #ccc'
      }}>
        <h2>Test Panel</h2>
        <p>This is a test to verify the app is rendering.</p>
      </div>
    </div>
  );
}

export default SimpleApp;

// Made with Bob
