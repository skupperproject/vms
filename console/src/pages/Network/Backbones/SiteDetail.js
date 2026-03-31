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
  TextInput,
  Checkbox,
  Select,
  SelectItem,
  NumberInput,
  IconButton
} from '@carbon/react';
import { ArrowLeft, Add, TrashCan, Edit } from '@carbon/icons-react';

const SiteDetail = () => {
  const { backboneId, siteId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessPoints, setAccessPoints] = useState([]);
  const [loadingAccessPoints, setLoadingAccessPoints] = useState(true);
  const [accessPointsError, setAccessPointsError] = useState(null);
  const [outgoingLinks, setOutgoingLinks] = useState([]);
  const [loadingOutgoingLinks, setLoadingOutgoingLinks] = useState(true);
  const [outgoingLinksError, setOutgoingLinksError] = useState(null);
  const [peerAccessPoints, setPeerAccessPoints] = useState([]);
  const [loadingPeerAPs, setLoadingPeerAPs] = useState(false);
  const [createLinkModalOpen, setCreateLinkModalOpen] = useState(false);
  const [selectedPeerAP, setSelectedPeerAP] = useState('');
  const [linkCost, setLinkCost] = useState(1);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [createLinkError, setCreateLinkError] = useState(null);
  const [editLinkModalOpen, setEditLinkModalOpen] = useState(false);
  const [linkToEdit, setLinkToEdit] = useState(null);
  const [editLinkCost, setEditLinkCost] = useState(1);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [editLinkError, setEditLinkError] = useState(null);
  const [deleteAPModalOpen, setDeleteAPModalOpen] = useState(false);
  const [apToDelete, setApToDelete] = useState(null);
  const [isDeletingAP, setIsDeletingAP] = useState(false);
  const [deleteAPError, setDeleteAPError] = useState(null);
  const [createAPModalOpen, setCreateAPModalOpen] = useState(false);
  const [selectedApKinds, setSelectedApKinds] = useState([]);
  const [apName, setApName] = useState('');
  const [apBindHost, setApBindHost] = useState('');
  const [isCreatingAP, setIsCreatingAP] = useState(false);
  const [createAPError, setCreateAPError] = useState(null);

  const handleApKindToggle = (kind, checked) => {
    if (checked) {
      setSelectedApKinds([...selectedApKinds, kind]);
    } else {
      setSelectedApKinds(selectedApKinds.filter(k => k !== kind));
    }
  };

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

  const fetchOutgoingLinks = useCallback(async () => {
    try {
      setLoadingOutgoingLinks(true);
      setOutgoingLinksError(null);
      const response = await fetch(`/api/v1alpha1/backbonesites/${siteId}/links`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const links = await response.json();
      
      // Fetch site and access point names for each link
      const enrichedLinks = await Promise.all(
        links.map(async (link) => {
          try {
            // Fetch access point details first to get its interior site
            let siteName = 'Unknown';
            let apName = 'Unknown';
            
            if (link.accesspoint) {
              const apResponse = await fetch(`/api/v1alpha1/accesspoints/${link.accesspoint}`);
              if (apResponse.ok) {
                const apData = await apResponse.json();
                apName = apData.name || link.accesspoint;
                
                // Now fetch the interior site referenced by this access point
                if (apData.interiorsite) {
                  const siteResponse = await fetch(`/api/v1alpha1/backbonesites/${apData.interiorsite}`);
                  if (siteResponse.ok) {
                    const siteData = await siteResponse.json();
                    siteName = siteData.name || apData.interiorsite;
                  }
                }
              }
            }
            
            return {
              ...link,
              siteName,
              apName,
              formattedAccessPoint: `${siteName}/${apName}`
            };
          } catch (err) {
            console.error('Error fetching link details:', err);
            return {
              ...link,
              siteName: 'Error',
              apName: 'Error',
              formattedAccessPoint: 'Error/Error'
            };
          }
        })
      );
      
      setOutgoingLinks(enrichedLinks);
    } catch (err) {
      setOutgoingLinksError(err.message);
      console.error('Error fetching outgoing links:', err);
    } finally {
      setLoadingOutgoingLinks(false);
    }
  }, [siteId]);

  const fetchPeerAccessPoints = useCallback(async () => {
    try {
      setLoadingPeerAPs(true);
      const response = await fetch(`/api/v1alpha1/backbones/${backboneId}/accesspoints`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const allAPs = await response.json();
      
      // Filter for peer access points (excluding those on the current site) and enrich with site names
      const peerAPs = await Promise.all(
        allAPs
          .filter(ap => ap.kind === 'peer' && ap.interiorsite !== siteId)
          .map(async (ap) => {
            try {
              // Fetch the interior site name for this access point
              let siteName = 'Unknown';
              if (ap.interiorsite) {
                const siteResponse = await fetch(`/api/v1alpha1/backbonesites/${ap.interiorsite}`);
                if (siteResponse.ok) {
                  const siteData = await siteResponse.json();
                  siteName = siteData.name || ap.interiorsite;
                }
              }
              
              return {
                ...ap,
                siteName,
                label: `${siteName}/${ap.name || ap.id}`
              };
            } catch (err) {
              console.error('Error fetching site for access point:', err);
              return {
                ...ap,
                siteName: 'Error',
                label: `Error/${ap.name || ap.id}`
              };
            }
          })
      );
      
      setPeerAccessPoints(peerAPs);
    } catch (err) {
      console.error('Error fetching peer access points:', err);
    } finally {
      setLoadingPeerAPs(false);
    }
  }, [backboneId, siteId]);

  useEffect(() => {
    fetchSiteDetails();
    fetchAccessPoints();
    fetchOutgoingLinks();
  }, [siteId, fetchSiteDetails, fetchAccessPoints, fetchOutgoingLinks]);

  const handleOpenCreateLinkModal = () => {
    setCreateLinkModalOpen(true);
    setSelectedPeerAP('');
    setLinkCost(1);
    setCreateLinkError(null);
    fetchPeerAccessPoints();
  };

  const handleCreateLink = async () => {
    if (!selectedPeerAP) {
      setCreateLinkError('Please select an access point');
      return;
    }

    try {
      setIsCreatingLink(true);
      setCreateLinkError(null);
      
      const payload = {
        connectingsite: siteId,
        cost: linkCost
      };

      const response = await fetch(`/api/v1alpha1/accesspoints/${selectedPeerAP}/links`, {
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
      setSelectedPeerAP('');
      setLinkCost(1);
      setCreateLinkModalOpen(false);
      
      // Refresh the outgoing links list
      fetchOutgoingLinks();
    } catch (err) {
      console.error('Error creating link:', err);
      setCreateLinkError(err.message || 'Failed to create link');
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleEditLinkClick = (link) => {
    setLinkToEdit(link);
    setEditLinkCost(link.cost || 1);
    setEditLinkModalOpen(true);
    setEditLinkError(null);
  };

  const handleEditLink = async () => {
    if (!linkToEdit) return;

    try {
      setIsEditingLink(true);
      setEditLinkError(null);
      
      const payload = {
        cost: editLinkCost
      };

      const response = await fetch(`/api/v1alpha1/backbonelinks/${linkToEdit.id}`, {
        method: 'PUT',
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

      // Close modal and refresh
      setEditLinkModalOpen(false);
      setLinkToEdit(null);
      
      // Refresh the outgoing links list
      fetchOutgoingLinks();
    } catch (err) {
      console.error('Error editing link:', err);
      setEditLinkError(err.message || 'Failed to edit link');
    } finally {
      setIsEditingLink(false);
    }
  };

  const handleDeleteLink = async (link) => {
    try {
      const response = await fetch(`/api/v1alpha1/backbonelinks/${link.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Refresh the outgoing links list
      fetchOutgoingLinks();
    } catch (err) {
      console.error('Error deleting link:', err);
      // You might want to show an error notification here
    }
  };

  const handleCreateAccessPoint = async () => {
    if (selectedApKinds.length === 0) {
      setCreateAPError('Please select at least one access point kind');
      return;
    }

    try {
      setIsCreatingAP(true);
      setCreateAPError(null);
      
      // Loop through each selected kind and create an access point
      for (const kind of selectedApKinds) {
        const payload = {
          kind: kind,
        };

        // Add optional fields only if exactly one kind is selected
        if (selectedApKinds.length === 1) {
          if (apName.trim()) {
            payload.name = apName.trim();
          }
          if (apBindHost.trim()) {
            payload.bindhost = apBindHost.trim();
          }
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
      }

      // Reset form and close modal
      setSelectedApKinds([]);
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
        <BreadcrumbItem href="/backbones">Backbones</BreadcrumbItem>
        <BreadcrumbItem href={`/backbones/${backboneId}`}>
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
            onClick={() => navigate(`/backbones/${backboneId}`)}
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
                    Add Access Points
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
                          Add Access Points
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
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                      <IconButton
                                        kind="ghost"
                                        label="Delete access point"
                                        tooltipPosition="top"
                                        onClick={() => handleDeleteAPClick(cell.value)}
                                        size="sm"
                                      >
                                        <TrashCan />
                                      </IconButton>
                                    </div>
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
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Outgoing Links</h3>
            
            {loadingOutgoingLinks && (
              <Loading description="Loading outgoing links..." withOverlay={false} />
            )}

            {outgoingLinksError && (
              <InlineNotification
                kind="error"
                title="Error loading outgoing links"
                subtitle={outgoingLinksError}
                onCloseButtonClick={() => setOutgoingLinksError(null)}
                style={{ marginBottom: '1rem' }}
              />
            )}

            {!loadingOutgoingLinks && !outgoingLinksError && outgoingLinks.length === 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                  <Button
                    kind="primary"
                    renderIcon={Add}
                    onClick={handleOpenCreateLinkModal}
                  >
                    New Link
                  </Button>
                </div>
                <Tile>
                  <p style={{ color: '#525252', fontStyle: 'italic' }}>
                    No outgoing links configured for this site. Click "New Link" to create one.
                  </p>
                </Tile>
              </div>
            )}

            {!loadingOutgoingLinks && !outgoingLinksError && outgoingLinks.length > 0 && (
              <DataTable
                rows={outgoingLinks.map((link) => ({
                  id: link.id,
                  accessPoint: link.formattedAccessPoint,
                  cost: link.cost || 'N/A',
                  actions: link,
                }))}
                headers={[
                  { key: 'accessPoint', header: 'Access Point' },
                  { key: 'cost', header: 'Cost' },
                  { key: 'actions', header: '' },
                ]}
              >
                {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                  <TableContainer>
                    <TableToolbar>
                      <TableToolbarContent>
                        <Button
                          kind="primary"
                          renderIcon={Add}
                          onClick={handleOpenCreateLinkModal}
                        >
                          New Link
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
                              if (cell.info.header === 'actions') {
                                return (
                                  <TableCell key={cell.id}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                      <IconButton
                                        kind="ghost"
                                        label="Edit link"
                                        tooltipPosition="top"
                                        onClick={() => handleEditLinkClick(cell.value)}
                                        size="sm"
                                      >
                                        <Edit />
                                      </IconButton>
                                      <IconButton
                                        kind="ghost"
                                        label="Delete link"
                                        tooltipPosition="top"
                                        onClick={() => handleDeleteLink(cell.value)}
                                        size="sm"
                                      >
                                        <TrashCan />
                                      </IconButton>
                                    </div>
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
        modalHeading="Add Access Points"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setCreateAPModalOpen(false);
          setSelectedApKinds([]);
          setApName('');
          setApBindHost('');
          setCreateAPError(null);
        }}
        onRequestSubmit={handleCreateAccessPoint}
        primaryButtonDisabled={isCreatingAP || selectedApKinds.length === 0}
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
        
        <fieldset style={{ border: 'none', padding: 0, marginBottom: '1rem' }}>
          <legend style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Access Point Kinds</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Checkbox
              labelText="van - Used by external VANs for management"
              id="kind-van"
              checked={selectedApKinds.includes('van')}
              onChange={(e) => handleApKindToggle('van', e.target.checked)}
              disabled={isCreatingAP}
            />
            <Checkbox
              labelText="claim - Used by tenant VANs to claim invitations"
              id="kind-claim"
              checked={selectedApKinds.includes('claim')}
              onChange={(e) => handleApKindToggle('claim', e.target.checked)}
              disabled={isCreatingAP}
            />
            <Checkbox
              labelText="member - Used by tenant VANs to join the service backbone"
              id="kind-member"
              checked={selectedApKinds.includes('member')}
              onChange={(e) => handleApKindToggle('member', e.target.checked)}
              disabled={isCreatingAP}
            />
            <Checkbox
              labelText="peer - Used by other backbone sites to interconnect"
              id="kind-peer"
              checked={selectedApKinds.includes('peer')}
              onChange={(e) => handleApKindToggle('peer', e.target.checked)}
              disabled={isCreatingAP}
            />
            <Checkbox
              labelText="manage - Used by the management server to manage the backbone"
              id="kind-manage"
              checked={selectedApKinds.includes('manage')}
              onChange={(e) => handleApKindToggle('manage', e.target.checked)}
              disabled={isCreatingAP}
            />
          </div>
        </fieldset>

        <TextInput
          id="ap-name"
          labelText="Name (Optional)"
          placeholder="Enter access point name"
          value={apName}
          onChange={(e) => setApName(e.target.value)}
          disabled={isCreatingAP || selectedApKinds.length !== 1}
          style={{ marginBottom: '1rem' }}
        />

        <TextInput
          id="ap-bindhost"
          labelText="Bind Host (Optional)"
          placeholder="Enter bind host"
          value={apBindHost}
          onChange={(e) => setApBindHost(e.target.value)}
          disabled={isCreatingAP || selectedApKinds.length !== 1}
          style={{ marginBottom: '1rem' }}
        />
      </Modal>

      <Modal
        open={createLinkModalOpen}
        modalHeading="Create New Link"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setCreateLinkModalOpen(false);
          setSelectedPeerAP('');
          setLinkCost(1);
          setCreateLinkError(null);
        }}
        onRequestSubmit={handleCreateLink}
        primaryButtonDisabled={isCreatingLink || !selectedPeerAP}
      >
        {createLinkError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={createLinkError}
            onCloseButtonClick={() => setCreateLinkError(null)}
            style={{ marginBottom: '1rem' }}
          />
        )}
        
        {loadingPeerAPs ? (
          <Loading description="Loading peer access points..." withOverlay={false} />
        ) : (
          <>
            <Select
              id="peer-ap-select"
              labelText="Access Point"
              value={selectedPeerAP}
              onChange={(e) => setSelectedPeerAP(e.target.value)}
              disabled={isCreatingLink}
              style={{ marginBottom: '1rem' }}
            >
              <SelectItem value="" text="Select an access point" />
              {peerAccessPoints.map((ap) => (
                <SelectItem key={ap.id} value={ap.id} text={ap.label} />
              ))}
            </Select>

            <NumberInput
              id="link-cost"
              label="Cost"
              value={linkCost}
              onChange={(e, { value }) => setLinkCost(value)}
              min={0}
              step={1}
              disabled={isCreatingLink}
              style={{ marginBottom: '1rem' }}
            />
          </>
        )}
      </Modal>

      <Modal
        open={editLinkModalOpen}
        modalHeading="Edit Link"
        primaryButtonText="Save"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setEditLinkModalOpen(false);
          setLinkToEdit(null);
          setEditLinkCost(1);
          setEditLinkError(null);
        }}
        onRequestSubmit={handleEditLink}
        primaryButtonDisabled={isEditingLink}
      >
        {editLinkError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={editLinkError}
            onCloseButtonClick={() => setEditLinkError(null)}
            style={{ marginBottom: '1rem' }}
          />
        )}
        
        {linkToEdit && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>Access Point</p>
              <p style={{ fontWeight: 500 }}>{linkToEdit.formattedAccessPoint}</p>
            </div>

            <NumberInput
              id="edit-link-cost"
              label="Cost"
              value={editLinkCost}
              onChange={(e, { value }) => setEditLinkCost(value)}
              min={0}
              step={1}
              disabled={isEditingLink}
              style={{ marginBottom: '1rem' }}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default SiteDetail;

// Made with Bob