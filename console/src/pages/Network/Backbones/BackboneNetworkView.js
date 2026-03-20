import React from 'react';
import { Tile } from '@carbon/react';

const BackboneNetworkView = ({ sites, backboneName }) => {
  return (
    <Tile className="blank-panel" style={{ minHeight: '500px' }}>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ marginBottom: '1rem' }}>Network Topology View</h3>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          Graphical network visualization will be implemented here
        </p>
        <p style={{ color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
          {sites.length} site(s) in backbone: {backboneName}
        </p>
      </div>
    </Tile>
  );
};

export default BackboneNetworkView;

// Made with Bob