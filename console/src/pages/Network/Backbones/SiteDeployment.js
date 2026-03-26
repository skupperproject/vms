import React, { useState } from 'react';
import {
  Modal,
  Link,
  TextArea,
  Button,
} from '@carbon/react';

const SiteDeployment = ({ open, site, onClose }) => {
  const [ingressData, setIngressData] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleIngressSubmit = async () => {
    if (!site || !ingressData.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1alpha1/backbonesite/${site.id}/ingress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: ingressData,
      });

      if (!response.ok) {
        throw new Error(`Failed to submit ingress data: ${response.statusText}`);
      }

      alert('Ingress data submitted successfully');
      setIngressData('');
    } catch (error) {
      console.error('Error submitting ingress data:', error);
      alert(`Error submitting ingress data: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  const getDeploymentContent = () => {
    if (!site) return null;

    switch (site.deploymentstate) {
      case 'ready-bootstrap':
        return (
          <>
            <h4 style={{ marginBottom: '1rem' }}>Bootstrap Deployment</h4>
            <p>
              Site <strong>{site.name}</strong> is ready for bootstrap deployment.
            </p>
            
            <div style={{ marginTop: '1.5rem' }}>
              <h5 style={{ marginBottom: '0.5rem' }}>Download Bootstrap Configuration</h5>
              <Link
                href={`/api/v1alpha1/backbonesite/${site.id}/${site['targetplatform']}`}
                download={`${site['name']}.yaml`}
              >
                Download initial bootstrap configuration
              </Link>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f4f4f4', borderRadius: '4px' }}>
              <p style={{ color: '#525252' }}>
                [Placeholder text - to be supplied later]
              </p>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <h5 style={{ marginBottom: '0.5rem' }}>Ingress JSON Data</h5>
              <TextArea
                id="ingress-data"
                labelText=""
                placeholder="Enter ingress JSON data here..."
                value={ingressData}
                onChange={(e) => setIngressData(e.target.value)}
                rows={8}
                style={{ marginBottom: '1rem' }}
              />
              <Button
                onClick={handleIngressSubmit}
                disabled={!ingressData.trim() || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Ingress Data'}
              </Button>
            </div>
          </>
        );

      case 'ready-bootfinish':
        return (
          <>
            <h4 style={{ marginBottom: '1rem' }}>Complete Bootstrap Deployment</h4>
            <p>
              Site <strong>{site.name}</strong> is ready to complete bootstrap deployment.
            </p>
            <p style={{ marginTop: '1rem', color: '#525252' }}>
              The bootstrap process has been initiated. Complete the deployment by
              finalizing the bootstrap configuration.
            </p>
            
            <div style={{ marginTop: '1.5rem' }}>
              <h5 style={{ marginBottom: '0.5rem' }}>Download Access Points Configuration</h5>
              <Link
                href={`/api/v1alpha1/backbonesite/${site.id}/accesspoints/${site['targetplatform']}`}
                download={`${site['name']}-finish.yaml`}
              >
                Download access points configuration
              </Link>
            </div>
          </>
        );

      case 'ready-automatic':
        return (
          <>
            <h4 style={{ marginBottom: '1rem' }}>Automatic Deployment</h4>
            <p>
              Site <strong>{site.name}</strong> is ready for automatic deployment.
            </p>
            <p style={{ marginTop: '1rem', color: '#525252' }}>
              Automatic deployment will configure and deploy the site without manual
              intervention using pre-configured settings.
            </p>
            
            <div style={{ marginTop: '1.5rem' }}>
              <h5 style={{ marginBottom: '0.5rem' }}>Download Deployment Configuration</h5>
              <Link
                href={`/api/v1alpha1/backbonesite/${site.id}/${site['targetplatform']}`}
                download={`${site['name']}.yaml`}
              >
                Download deployment configuration
              </Link>
            </div>
          </>
        );

      default:
        return (
          <>
            <p>
              Deployment dialog for site <strong>{site.name}</strong>.
            </p>
            <p style={{ marginTop: '1rem', color: '#525252' }}>
              Deployment state: {site.deploymentstate}
            </p>
          </>
        );
    }
  };

  return (
    <Modal
      open={open}
      modalHeading="Deploy Site"
      primaryButtonText="Close"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
    >
      {getDeploymentContent()}
    </Modal>
  );
};

export default SiteDeployment;

// Made with Bob