import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Tile,
  Loading,
  InlineNotification,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  Tag,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  TextInput,
  RadioButtonGroup,
  RadioButton
} from '@carbon/react';
import { ArrowLeft, Add } from '@carbon/icons-react';

const SiteDetail = () => {
  const { backboneId, siteId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessPoints, setAccessPoints] = useState([]);
  const [loadingAccessPoints, setLoadingAccessPoints] = useState(true);
  const [accessPointsError, setAccessPointsError] = useState(null);
  const [deleteAPModalOpen, setDeleteAPModalOpen] = useState(false);
  const [apToDelete, setApToDelete] = useState(null);
  const [isDeletingAP, setIsDeletingAP] = useState(false);
  const [deleteAPError, setDeleteAPError] = useState(null);
  const [createAPModalOpen, setCreateAPModalOpen] = useState(false);
  const [apKind, setApKind] = useState('van');
  const [apName, setApName] = useState('');
  const [apBindHost, setApBindHost] = useState('');
  const [isCreatingAP, setIsCreatingAP] = useState(false);
  const [createAPError, setCreateAPError] = useState(null);

  const fetchSiteDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/v1alpha1/backbonesites/${siteId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSite(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching site details:', err);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchAccessPoints = useCallback(async () => {
    try {
      setLoadingAccessPoints(true);
      setAccessPointsError(null);
      const response = await fetch(`/api/v1alpha1/backbonesites/${siteId}/accesspoints`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setAccessPoints(data);
    } catch (err) {
      setAccessPointsError(err.message);
      console.error('Error fetching access points:', err);
    } finally {
      setLoadingAccessPoints(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchSiteDetails();
    fetchAccessPoints();
  }, [siteId, fetchSiteDetails, fetchAccessPoints]);

  const handleCreateAccessPoint = async () => {
    if (!apKind) {
      setCreateAPError('Please select an access point kind');
      return;
    }

    try {
      setIsCreatingAP(true);
      setCreateAPError(null);
      
      const payload = {
        kind: apKind,
      };

      // Add optional fields
      if (apName.trim()) {
        payload.name = apName.trim();
      }
      if (apBindHost.trim()) {
        payload.bindhost = apBindHost.trim();
      }

      const response = await fetch(`/api/v1alpha1/backbonesites/${siteId}/accesspoints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorMessage = errorBody;
          }
        } catch (e) {
          // If we can't read the body, use the default error message
        }
        throw new Error(errorMessage);
      }

      // Reset form and close modal
      setApKind('van');
      setApName('');
      setApBindHost('');
      setCreateAPModalOpen(false);
      
      // Refresh the access points list
      fetchAccessPoints();
    } catch (err) {
      console.error('Error creating access point:', err);
      setCreateAPError(err.message || 'Failed to create access point');
    } finally {
      setIsCreatingAP(false);
    }
  };

  const handleDeleteAPClick = (accessPoint) => {
    setApToDelete(accessPoint);
    setDeleteAPModalOpen(true);
    setDeleteAPError(null);
  };

  const handleDeleteAccessPoint = async () => {
    if (!apToDelete) return;

    try {
      setIsDeletingAP(true);
      setDeleteAPError(null);
      
      const response = await fetch(`/api/v1alpha1/accesspoints/${apToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Close modal and refresh
      setDeleteAPModalOpen(false);
      setApToDelete(null);
      
      // Refresh the access points list
      fetchAccessPoints();
    } catch (err) {
      console.error('Error deleting access point:', err);
      setDeleteAPError(err.message || 'Failed to delete access point');
    } finally {
      setIsDeletingAP(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatus = (accessPoint) => {
    if (accessPoint.lifecycle === 'failed') {
      return {
        text: accessPoint.failure ? `failed: ${accessPoint.failure}` : 'failed',
        type: 'red'
      };
    } else {
      const lifecycle = accessPoint.lifecycle || 'unknown';
      let type = 'gray';
      switch (lifecycle.toLowerCase()) {
        case 'ready':
        case 'active':
          type = 'green';
          break;
        case 'pending':
        case 'partial':
          type = 'blue';
          break;
        case 'error':
          type = 'red';
          break;
        default:
          type = 'gray';
      }
      return {
        text: lifecycle,
        type: type
      };
    }
  };

  const accessPointHeaders = [
    { key: 'name', header: 'Name' },
    { key: 'kind', header: 'Kind' },
    { key: 'status', header: 'Status' },
    { key: 'hostname', header: 'Hostname' },
    { key: 'port', header: 'Port' },
    { key: 'bindhost', header: 'Bind Host' },
    { key: 'actions', header: '' },
  ];

  const accessPointRows = accessPoints.map((ap) => {
    const status = getStatus(ap);
    return {
      id: ap.id,
      name: ap.name,
      kind: ap.kind,
      hostname: ap.hostname || 'N/A',
      port: ap.port || 'N/A',
      bindhost: ap.bindhost || 'N/A',
      status: status,
      actions: ap,
    };
  });

  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/">Dashboard</BreadcrumbItem>
        <BreadcrumbItem href="/network/backbones">Network</BreadcrumbItem>
        <BreadcrumbItem href="/network/backbones">Backbones</BreadcrumbItem>
        <BreadcrumbItem href={`/network/backbones/${backboneId}`}>
          Backbone Detail
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>Site Detail</BreadcrumbItem>
      </Breadcrumb>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowLeft}
            iconDescription="Back to Backbone"
            onClick={() => navigate(`/network/backbones/${backboneId}`)}
            hasIconOnly
          />
          <h1>{site?.name || 'Site Detail'}</h1>
        </div>
        <p>View and manage site configuration and connections.</p>
      </div>

      {loading && (
        <Loading description="Loading site details..." withOverlay={false} />
      )}

      {error && (
        <InlineNotification
          kind="error"
          title="Error loading site details"
          subtitle={error}
          onCloseButtonClick={() => setError(null)}
          style={{ marginBottom: '1rem' }}
        />
      )}

      {!loading && !error && site && (
        <>
          {/* Site Information Panel */}
          <Tile style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Site Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>Name</p>
                <p style={{ fontWeight: 500 }}>{site.name}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>ID</p>
                <p style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.875rem' }}>{site.id}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>Lifecycle</p>
                <p style={{ fontWeight: 500 }}>{site.lifecycle || 'N/A'}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>Deployment State</p>
                <p style={{ fontWeight: 500 }}>{site.deploymentstate || 'N/A'}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>Target Platform</p>
                <p style={{ fontWeight: 500 }}>{site.platformlong || site.targetplatform || 'N/A'}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>Last Heartbeat</p>
                <p style={{ fontWeight: 500 }}>{formatDate(site.lastheartbeat)}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>TLS Expiration</p>
                <p style={{ fontWeight: 500 }}>{formatDate(site.tlsexpiration)}</p>
              </div>
            </div>
          </Tile>

          {/* Site Access Points Panel */}
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Site Access Points</h3>
            
            {loadingAccessPoints && (
              <Loading description="Loading access points..." withOverlay={false} />
            )}

            {accessPointsError && (
              <InlineNotification
                kind="error"
                title="Error loading access points"
                subtitle={accessPointsError}
                onCloseButtonClick={() => setAccessPointsError(null)}
                style={{ marginBottom: '1rem' }}
              />
            )}

            {!loadingAccessPoints && !accessPointsError && accessPoints.length === 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                  <Button
                    kind="primary"
                    renderIcon={Add}
                    onClick={() => setCreateAPModalOpen(true)}
                  >
                    New Access Point
                  </Button>
                </div>
                <Tile>
                  <p style={{ color: '#525252', fontStyle: 'italic' }}>
                    No access points configured for this site. Click "New Access Point" to create one.
                  </p>
                </Tile>
              </div>
            )}

            {!loadingAccessPoints && !accessPointsError && accessPoints.length > 0 && (
              <DataTable rows={accessPointRows} headers={accessPointHeaders}>
                {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                  <TableContainer>
                    <TableToolbar>
                      <TableToolbarContent>
                        <Button
                          kind="primary"
                          renderIcon={Add}
                          onClick={() => setCreateAPModalOpen(true)}
                        >
                          New Access Point
                        </Button>
                      </TableToolbarContent>
                    </TableToolbar>
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header) => (
                            <TableHeader {...getHeaderProps({ header })} key={header.key}>
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow {...getRowProps({ row })} key={row.id}>
                            {row.cells.map((cell) => {
                              if (cell.info.header === 'status') {
                                return (
                                  <TableCell key={cell.id}>
                                    <Tag type={cell.value.type}>
                                      {cell.value.text}
                                    </Tag>
                                  </TableCell>
                                );
                              }
                              if (cell.info.header === 'actions') {
                                return (
                                  <TableCell key={cell.id}>
                                    <OverflowMenu size="sm" flipped>
                                      <OverflowMenuItem
                                        itemText="Delete"
                                        isDelete
                                        onClick={() => handleDeleteAPClick(cell.value)}
                                      />
                                    </OverflowMenu>
                                  </TableCell>
                                );
                              }
                              return <TableCell key={cell.id}>{cell.value}</TableCell>;
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>
            )}
          </div>

          {/* Outgoing Links Panel */}
          <Tile>
            <h3 style={{ marginBottom: '1rem' }}>Outgoing Links</h3>
            <p style={{ color: '#525252', fontStyle: 'italic' }}>
              Outgoing links will be displayed here.
            </p>
          </Tile>
        </>
      )}

      <Modal
        open={deleteAPModalOpen}
        danger
        modalHeading="Delete Access Point"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setDeleteAPModalOpen(false);
          setApToDelete(null);
          setDeleteAPError(null);
        }}
        onRequestSubmit={handleDeleteAccessPoint}
        primaryButtonDisabled={isDeletingAP}
      >
        {deleteAPError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={deleteAPError}
            onCloseButtonClick={() => setDeleteAPError(null)}
            style={{ marginBottom: '1rem' }}
          />
        )}
        
        <p>
          Are you sure you want to delete the access point <strong>{apToDelete?.name}</strong>?
          This action cannot be undone.
        </p>
      </Modal>

      <Modal
        open={createAPModalOpen}
        modalHeading="Create New Access Point"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setCreateAPModalOpen(false);
          setApKind('van');
          setApName('');
          setApBindHost('');
          setCreateAPError(null);
        }}
        onRequestSubmit={handleCreateAccessPoint}
        primaryButtonDisabled={isCreatingAP || !apKind}
      >
        {createAPError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={createAPError}
            onCloseButtonClick={() => setCreateAPError(null)}
            style={{ marginBottom: '1rem' }}
          />
        )}
        
        <RadioButtonGroup
          legendText="Access Point Kind"
          name="ap-kind"
          valueSelected={apKind}
          onChange={setApKind}
          style={{ marginBottom: '1rem' }}
          orientation="vertical"
        >
          <RadioButton
            labelText="van - Used by external VANs for management"
            value="van"
            id="kind-van"
          />
          <RadioButton
            labelText="claim - Used by tenant VANs to claim invitations"
            value="claim"
            id="kind-claim"
          />
          <RadioButton
            labelText="member - Used by tenant VANs to join the service backbone"
            value="member"
            id="kind-member"
          />
          <RadioButton
            labelText="peer - Used by other backbone sites to interconnect"
            value="peer"
            id="kind-peer"
          />
          <RadioButton
            labelText="manage - Used by the management server to manage the backbone"
            value="manage"
            id="kind-manage"
          />
        </RadioButtonGroup>

        <TextInput
          id="ap-name"
          labelText="Name (Optional)"
          placeholder="Enter access point name"
          value={apName}
          onChange={(e) => setApName(e.target.value)}
          disabled={isCreatingAP}
          style={{ marginBottom: '1rem' }}
        />

        <TextInput
          id="ap-bindhost"
          labelText="Bind Host (Optional)"
          placeholder="Enter bind host"
          value={apBindHost}
          onChange={(e) => setApBindHost(e.target.value)}
          disabled={isCreatingAP}
          style={{ marginBottom: '1rem' }}
        />
      </Modal>
    </div>
  );
};

export default SiteDetail;

// Made with Bob