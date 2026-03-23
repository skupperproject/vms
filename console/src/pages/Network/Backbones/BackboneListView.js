import React, { useState, useEffect } from 'react';
import {
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
  Button,
  Modal,
  TextInput,
  Select,
  SelectItem,
  InlineNotification,
  Tag,
  OverflowMenu,
  OverflowMenuItem,
} from '@carbon/react';
import { Add } from '@carbon/icons-react';

const BackboneListView = ({ sites, backboneName, backboneId, onSiteCreated }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [loadingPlatforms, setLoadingPlatforms] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    if (isModalOpen && platforms.length === 0) {
      fetchPlatforms();
    }
  }, [isModalOpen, platforms.length]);

  const fetchPlatforms = async () => {
    try {
      setLoadingPlatforms(true);
      const response = await fetch('/api/v1alpha1/targetplatforms');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setPlatforms(data);
    } catch (err) {
      console.error('Error fetching platforms:', err);
      setCreateError('Failed to load platform options');
    } finally {
      setLoadingPlatforms(false);
    }
  };

  const handleCreateSite = async () => {
    if (!siteName.trim() || !selectedPlatform) {
      setCreateError('Please provide both a site name and select a platform');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      
      const response = await fetch(`/api/v1alpha1/backbones/${backboneId}/sites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: siteName.trim(),
          platform: selectedPlatform,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Reset form and close modal
      setSiteName('');
      setSelectedPlatform('');
      setIsModalOpen(false);
      
      // Notify parent to refresh the sites list
      if (onSiteCreated) {
        onSiteCreated();
      }
    } catch (err) {
      console.error('Error creating site:', err);
      setCreateError(err.message || 'Failed to create site');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClick = (site) => {
    setSiteToDelete(site);
    setDeleteModalOpen(true);
    setDeleteError(null);
  };

  const handleDeleteSite = async () => {
    if (!siteToDelete) return;

    try {
      setIsDeleting(true);
      setDeleteError(null);
      
      const response = await fetch(`/api/v1alpha1/backbonesites/${siteToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Close modal and refresh
      setDeleteModalOpen(false);
      setSiteToDelete(null);
      
      // Notify parent to refresh the sites list
      if (onSiteCreated) {
        onSiteCreated();
      }
    } catch (err) {
      console.error('Error deleting site:', err);
      setDeleteError(err.message || 'Failed to delete site');
    } finally {
      setIsDeleting(false);
    }
  };

  const getLifecycleTagType = (lifecycle) => {
    switch (lifecycle?.toLowerCase()) {
      case 'active':
        return 'green';
      case 'pending':
        return 'blue';
      case 'inactive':
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getDeploymentTagType = (state) => {
    switch (state?.toLowerCase()) {
      case 'deployed':
        return 'green';
      case 'deploying':
        return 'blue';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatTimeSinceHeartbeat = (dateString) => {
    if (!dateString) return 'N/A';
    
    const heartbeatDate = new Date(dateString);
    const now = new Date();
    const diffMs = now - heartbeatDate;
    
    // Convert to minutes
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    // Less than 5 minutes
    if (diffMinutes < 5) {
      return 'within 5 minutes';
    }
    
    // Less than 60 minutes - show in minutes
    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    }
    
    // Less than 24 hours - show in hours
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    }
    
    // Less than 30 days - show in days
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  };

  const formatRelativeTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays} days`;
  };

  const getTLSTagType = (expirationDate) => {
    if (!expirationDate) return 'gray';
    const date = new Date(expirationDate);
    const now = new Date();
    const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'red';
    if (diffDays <= 7) return 'red';
    if (diffDays <= 14) return 'yellow';
    return 'green';
  };

  const headers = [
    { key: 'name', header: 'Name' },
    { key: 'lifecycle', header: 'Lifecycle' },
    { key: 'deploymentstate', header: 'Deployment' },
    { key: 'targetplatform', header: 'Platform' },
    { key: 'lastheartbeat', header: 'Last Heartbeat' },
    { key: 'tlsexpiration', header: 'TLS Expiration' },
    { key: 'actions', header: '' },
  ];

  const rows = sites.map((site) => ({
    id: site.id,
    name: site.name,
    lifecycle: site.lifecycle,
    deploymentstate: site.deploymentstate,
    targetplatform: site.platformlong || site.targetplatform,
    lastheartbeat: site.lastheartbeat,
    tlsexpiration: site.tlsexpiration,
    actions: site,
  }));

  return (
    <>
      {sites.length === 0 ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Sites</h3>
              <p style={{ color: 'var(--cds-text-secondary)', margin: '0.25rem 0 0 0' }}>
                No sites in this backbone
              </p>
            </div>
            <Button
              kind="primary"
              renderIcon={Add}
              onClick={() => setIsModalOpen(true)}
            >
              New Site
            </Button>
          </div>
          <InlineNotification
            kind="info"
            title="No sites found"
            subtitle="Click 'New Site' to add the first site to this backbone."
            hideCloseButton
          />
        </div>
      ) : (
        <DataTable rows={rows} headers={headers}>
          {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer title="Sites" description={`${sites.length} site(s) in this backbone`}>
              <TableToolbar>
                <TableToolbarContent>
                  <Button
                    kind="primary"
                    renderIcon={Add}
                    onClick={() => setIsModalOpen(true)}
                  >
                    New Site
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
                        if (cell.info.header === 'lifecycle') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={getLifecycleTagType(cell.value)}>
                                {cell.value || 'unknown'}
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === 'deploymentstate') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={getDeploymentTagType(cell.value)}>
                                {cell.value || 'unknown'}
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === 'lastheartbeat') {
                          return (
                            <TableCell key={cell.id}>
                              {formatTimeSinceHeartbeat(cell.value)}
                            </TableCell>
                          );
                        }
                        if (cell.info.header === 'tlsexpiration') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={getTLSTagType(cell.value)}>
                                {formatRelativeTime(cell.value)}
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
                                  onClick={() => handleDeleteClick(cell.value)}
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

      <Modal
        open={isModalOpen}
        modalHeading="Create New Site"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setIsModalOpen(false);
          setSiteName('');
          setSelectedPlatform('');
          setCreateError(null);
        }}
        onRequestSubmit={handleCreateSite}
        primaryButtonDisabled={isCreating || loadingPlatforms || !siteName.trim() || !selectedPlatform}
      >
        {createError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={createError}
            onCloseButtonClick={() => setCreateError(null)}
            style={{ marginBottom: '1rem' }}
          />
        )}
        
        <TextInput
          id="site-name"
          labelText="Site Name"
          placeholder="Enter site name"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          disabled={isCreating}
          style={{ marginBottom: '1rem' }}
        />
        
        <Select
          id="platform-select"
          labelText="Target Platform"
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          disabled={isCreating || loadingPlatforms}
        >
          <SelectItem value="" text="Select a platform" />
          {platforms.map((platform) => (
            <SelectItem
              key={platform.shortname}
              value={platform.shortname}
              text={platform.longname}
            />
          ))}
        </Select>
      </Modal>

      <Modal
        open={deleteModalOpen}
        danger
        modalHeading="Delete Site"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setDeleteModalOpen(false);
          setSiteToDelete(null);
          setDeleteError(null);
        }}
        onRequestSubmit={handleDeleteSite}
        primaryButtonDisabled={isDeleting}
      >
        {deleteError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={deleteError}
            onCloseButtonClick={() => setDeleteError(null)}
            style={{ marginBottom: '1rem' }}
          />
        )}
        
        <p>
          Are you sure you want to delete the site <strong>{siteToDelete?.name}</strong>?
          This action cannot be undone.
        </p>
      </Modal>
    </>
  );
};

export default BackboneListView;

// Made with Bob