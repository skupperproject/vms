import React from 'react';
import { Breadcrumb, BreadcrumbItem, Tile } from '@carbon/react';

const VANs = () => {
  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/">Dashboard</BreadcrumbItem>
        <BreadcrumbItem href="/network/vans">Network</BreadcrumbItem>
        <BreadcrumbItem href="/network/vans" isCurrentPage>
          VANs
        </BreadcrumbItem>
      </Breadcrumb>
      
      <div className="page-header">
        <h1>VANs</h1>
        <p>Manage Virtual Area Networks and their configurations.</p>
      </div>

      <Tile className="blank-panel">
        <p>VANs content will be developed here</p>
      </Tile>
    </div>
  );
};

export default VANs;

// Made with Bob
