import React from 'react';
import {
  Modal,
} from '@carbon/react';

const SiteDeployment = ({ open, site, onClose }) => {
  return (
    <Modal
      open={open}
      modalHeading="Deploy Site"
      primaryButtonText="Close"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
    >
      <p>
        Deployment dialog for site <strong>{site?.name}</strong>.
      </p>
      <p style={{ marginTop: '1rem', color: '#525252' }}>
        Deployment functionality will be implemented here.
      </p>
    </Modal>
  );
};

export default SiteDeployment;

// Made with Bob