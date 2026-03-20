import React from 'react';
import { Breadcrumb, BreadcrumbItem, Tile } from '@carbon/react';

const Dashboard = () => {
  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/">Dashboard</BreadcrumbItem>
      </Breadcrumb>
      
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome to SkupperVMS. This is your main overview page.</p>
      </div>

      <Tile className="blank-panel">
        <p>Dashboard content will be developed here</p>
      </Tile>
    </div>
  );
};

export default Dashboard;

// Made with Bob
