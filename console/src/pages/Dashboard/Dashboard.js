import React from 'react';
import { Breadcrumb, BreadcrumbItem, Tile } from '@carbon/react';

const Dashboard = () => {
  const panels = [
    { title: 'Active Users', content: 'Active users information will be displayed here' },
    { title: 'VANs', content: 'VAN statistics will be displayed here' },
    { title: 'Backbones', content: 'Backbone information will be displayed here' },
    { title: 'Configuration Changes', content: 'Recent configuration changes will be displayed here' },
    { title: 'Issues', content: 'System issues will be displayed here' },
    { title: 'Logs', content: 'Recent logs will be displayed here' },
  ];

  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/" isCurrentPage>Dashboard</BreadcrumbItem>
      </Breadcrumb>
      
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome to SkupperVMS. This is your main overview page.</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginTop: '1rem'
      }}>
        {panels.map((panel, index) => (
          <Tile key={index} style={{ padding: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>{panel.title}</h4>
            <p style={{ color: '#525252', fontStyle: 'italic' }}>{panel.content}</p>
          </Tile>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;

// Made with Bob
