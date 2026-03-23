import React, { useState, useEffect, useCallback } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  InlineNotification,
  Loading,
  Select,
  SelectItem,
} from '@carbon/react';

const VANs = () => {
  const [vans, setVans] = useState([]);
  const [backbones, setBackbones] = useState([]);
  const [selectedBackbone, setSelectedBackbone] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingBackbones, setLoadingBackbones] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBackbones();
  }, []);

  const fetchBackbones = async () => {
    try {
      setLoadingBackbones(true);
      const response = await fetch('/api/v1alpha1/backbones');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setBackbones(data);
    } catch (err) {
      console.error('Error fetching backbones:', err);
      setError('Failed to load backbones');
    } finally {
      setLoadingBackbones(false);
    }
  };

  const fetchVANs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      let url;
      if (selectedBackbone === 'all') {
        url = '/api/v1alpha1/vans';
      } else {
        url = `/api/v1alpha1/backbones/${selectedBackbone}/vans`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setVans(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching VANs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedBackbone]);

  useEffect(() => {
    if (!loadingBackbones) {
      fetchVANs();
    }
  }, [selectedBackbone, loadingBackbones, fetchVANs]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatInterval = (interval) => {
    if (!interval || Object.keys(interval).length === 0) return '-';
    
    // Handle different interval formats
    if (interval.seconds) {
      const seconds = interval.seconds;
      if (seconds < 60) return `${seconds}s`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
      return `${Math.floor(seconds / 86400)}d`;
    }
    
    return JSON.stringify(interval);
  };

  const getLifecycleTagType = (lifecycle) => {
    switch (lifecycle?.toLowerCase()) {
      case 'ready':
      case 'active':
        return 'green';
      case 'pending':
      case 'creating':
        return 'blue';
      case 'failed':
      case 'error':
        return 'red';
      case 'deleting':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  const headers = [
    { key: 'name', header: 'Name' },
    ...(selectedBackbone === 'all' ? [{ key: 'backbonename', header: 'Backbone' }] : []),
    { key: 'tenantnetwork', header: 'Tenant Network' },
    { key: 'status', header: 'Status' },
    { key: 'starttime', header: 'Start Time' },
    { key: 'endtime', header: 'End Time' },
    { key: 'deletedelay', header: 'Delete Delay' },
  ];

  const getStatus = (van) => {
    if (van.lifecycle === 'ready') {
      return {
        text: van.connected === true ? 'connected' : 'not connected',
        type: van.connected === true ? 'green' : 'red'
      };
    } else if (van.lifecycle === 'failed') {
      return {
        text: van.failure ? `failed: ${van.failure}` : 'failed',
        type: 'red'
      };
    } else {
      // For other lifecycle states (pending, creating, deleting, etc.)
      return {
        text: van.lifecycle,
        type: van.lifecycle === 'deleting' ? 'yellow' : 'blue'
      };
    }
  };

  const rows = vans.map((van) => {
    const status = getStatus(van);
    return {
      id: van.id,
      name: van.name,
      ...(selectedBackbone === 'all' && { backbonename: van.backbonename }),
      tenantnetwork: van.tenantnetwork,
      status: status,
      starttime: van.starttime,
      endtime: van.endtime,
      deletedelay: van.deletedelay,
    };
  });

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

      <div style={{ marginBottom: '1rem', maxWidth: '300px' }}>
        <Select
          id="backbone-select"
          labelText="Backbones"
          value={selectedBackbone}
          onChange={(e) => setSelectedBackbone(e.target.value)}
          disabled={loadingBackbones}
        >
          <SelectItem value="all" text="All Backbones" />
          {backbones.map((backbone) => (
            <SelectItem
              key={backbone.id}
              value={backbone.id}
              text={backbone.name}
            />
          ))}
        </Select>
      </div>

      {loading && (
        <Loading description="Loading VANs..." withOverlay={false} />
      )}

      {error && (
        <InlineNotification
          kind="error"
          title="Error loading VANs"
          subtitle={error}
          onCloseButtonClick={() => setError(null)}
          style={{ marginBottom: '1rem' }}
        />
      )}

      {!loading && !error && vans.length === 0 && (
        <InlineNotification
          kind="info"
          title="No VANs found"
          subtitle={
            selectedBackbone === 'all'
              ? 'There are currently no VANs configured.'
              : 'There are no VANs in the selected backbone.'
          }
          hideCloseButton
          style={{ marginBottom: '1rem' }}
        />
      )}

      {!loading && !error && vans.length > 0 && (
        <DataTable rows={rows} headers={headers}>
          {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer
              title="Virtual Area Networks"
              description={`${vans.length} VAN(s) ${selectedBackbone === 'all' ? 'across all backbones' : 'in selected backbone'}`}
            >
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
                        if (cell.info.header === 'tenantnetwork') {
                          return (
                            <TableCell key={cell.id}>
                              {cell.value === true ? 'Yes' : cell.value === false ? 'No' : 'N/A'}
                            </TableCell>
                          );
                        }
                        if (cell.info.header === 'status') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={cell.value.type}>
                                {cell.value.text}
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === 'starttime' || cell.info.header === 'endtime') {
                          return (
                            <TableCell key={cell.id}>
                              {formatDate(cell.value)}
                            </TableCell>
                          );
                        }
                        if (cell.info.header === 'deletedelay') {
                          return (
                            <TableCell key={cell.id}>
                              {formatInterval(cell.value)}
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
  );
};

export default VANs;

// Made with Bob
