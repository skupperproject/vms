import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
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
import { CancelWatch, CreateWatch } from '../../../tools/watch';

const BackboneDetail = () => {
  const { backboneId } = useParams();
  const { backboneName = '', backboneOwnerGroup = '' } = useOutletContext() || {};
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'network'

  useEffect(() => {
    const watchContext = CreateWatch(`/api/v1alpha1/backbones/${backboneId}/sites`, function (message) {
      const body = message.body;
      if (body.method === 'GET' || body.method === 'UPDATE') {
        if (body.statusCode >= 200 && body.statusCode < 300) {
          const sortedSites = [...body.content].sort((a, b) => a.name.localeCompare(b.name));
          setSites(sortedSites);
          setLoading(false);
        } else {
          setError(body.content);
          setLoading(false);
        }
      }
    });

    return () => {
      CancelWatch(watchContext);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backboneId]);

  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/">Dashboard</BreadcrumbItem>
        <BreadcrumbItem href="/network/backbones">Network</BreadcrumbItem>
        <BreadcrumbItem href="/network/backbones">Backbones</BreadcrumbItem>
        <BreadcrumbItem href={`/network/backbones/${backboneId}`} isCurrentPage>
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
          backboneOwnerGroup={backboneOwnerGroup}
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
