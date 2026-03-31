import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  InlineNotification,
  Loading,
  ContentSwitcher,
  Switch,
} from '@carbon/react';
import BackboneListView from './BackboneListView';
import BackboneNetworkView from './BackboneNetworkView';

const BackboneDetail = () => {
  const { backboneId } = useParams();
  const [sites, setSites] = useState([]);
  const [backboneName, setBackboneName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'network'

  useEffect(() => {
    fetchSites();
    fetchBackboneInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backboneId]);

  const fetchBackboneInfo = async () => {
    try {
      const response = await fetch('/api/v1alpha1/backbones');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const backbones = await response.json();
      const backbone = backbones.find(b => b.id === backboneId);
      if (backbone) {
        setBackboneName(backbone.name);
      }
    } catch (err) {
      console.error('Error fetching backbone info:', err);
    }
  };

  const fetchSites = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/v1alpha1/backbones/${backboneId}/sites`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSites(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching sites:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/backbones">Backbones</BreadcrumbItem>
        <BreadcrumbItem href={`/backbones/${backboneId}`} isCurrentPage>
          {backboneName || backboneId}
        </BreadcrumbItem>
      </Breadcrumb>
      
      <div className="page-header">
        <h1>Backbone: {backboneName || 'Loading...'}</h1>
        <p>Sites in this backbone network</p>
        
        <div style={{ marginTop: '1.5rem' }}>
          <ContentSwitcher
            selectedIndex={viewMode === 'list' ? 0 : 1}
            onChange={(e) => setViewMode(e.name)}
          >
            <Switch name="list" text="List View" />
            <Switch name="network" text="Network View" />
          </ContentSwitcher>
        </div>
      </div>

      {loading && (
        <Loading description="Loading sites..." withOverlay={false} />
      )}

      {error && (
        <InlineNotification
          kind="error"
          title="Error loading sites"
          subtitle={error}
          onCloseButtonClick={() => setError(null)}
          style={{ marginBottom: '1rem' }}
        />
      )}

      {!loading && !error && viewMode === 'list' && (
        <BackboneListView
          sites={sites}
          backboneName={backboneName}
          backboneId={backboneId}
          onSiteCreated={fetchSites}
        />
      )}

      {!loading && !error && viewMode === 'network' && (
        <BackboneNetworkView sites={sites} backboneName={backboneName} />
      )}
    </div>
  );
};

export default BackboneDetail;

// Made with Bob
