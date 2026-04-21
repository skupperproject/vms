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
  TableToolbar,
  TableToolbarContent,
  Tag,
  InlineNotification,
  Loading,
  Select,
  SelectItem,
  Button,
  Modal,
  TextInput,
  RadioButtonGroup,
  RadioButton,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
  NumberInput,
  IconButton,
  Link,
} from '@carbon/react';
import { Add, TrashCan, Gui, Deploy } from '@carbon/icons-react';
import OwnerGroupSelect from '../../../components/OwnerGroupSelect/OwnerGroupSelect';

const VANs = () => {
  const [vans, setVans] = useState([]);
  const [backbones, setBackbones] = useState([]);
  const [selectedBackbone, setSelectedBackbone] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingBackbones, setLoadingBackbones] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [vanName, setVanName] = useState('');
  const [ownerGroup, setOwnerGroup] = useState('');
  const [networkType, setNetworkType] = useState('external');
  const [startDate, setStartDate] = useState(new Date());
  const [startTimeValue, setStartTimeValue] = useState(new Date().toTimeString().slice(0, 5));
  const [endDate, setEndDate] = useState(null);
  const [endTimeValue, setEndTimeValue] = useState('00:00');
  const [deleteDelay, setDeleteDelay] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [vanToDelete, setVanToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [vanToDeploy, setVanToDeploy] = useState(null);
  const [deploymentTarget, setDeploymentTarget] = useState('standalone');
  const [vanAccessPoints, setVanAccessPoints] = useState([]);
  const [loadingAccessPoints, setLoadingAccessPoints] = useState(false);

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

  const handleCreateVAN = async () => {
    if (!vanName.trim()) {
      setCreateError('Please provide a VAN name');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      
      const payload = {
        name: vanName.trim(),
        nettype: networkType,
        ownerGroup,
      };

      // Add optional fields only for tenant VANs
      if (networkType === 'tenant') {
        // Combine start date and time
        if (startDate && startTimeValue) {
          const [hours, minutes] = startTimeValue.split(':');
          const startDateTime = new Date(startDate);
          startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          payload.starttime = startDateTime.toISOString();
        }
        
        // Combine end date and time if end date is set
        if (endDate && endTimeValue) {
          const [hours, minutes] = endTimeValue.split(':');
          const endDateTime = new Date(endDate);
          endDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          payload.endtime = endDateTime.toISOString();
        }
        
        // Only include deletedelay if endDate is set and deleteDelay > 0
        if (endDate && deleteDelay > 0) {
          payload.deletedelay = deleteDelay;
        }
      }

      const response = await fetch(`/api/v1alpha1/backbones/${selectedBackbone}/vans`, {
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
        } catch {
          // If we can't read the body, use the default error message
        }
        throw new Error(errorMessage);
      }

      // Reset form and close modal
      setVanName('');
      setOwnerGroup('');
      setNetworkType('external');
      setStartDate(new Date());
      setStartTimeValue(new Date().toTimeString().slice(0, 5));
      setEndDate(null);
      setEndTimeValue('00:00');
      setDeleteDelay(0);
      setIsModalOpen(false);
      
      // Refresh the VANs list
      fetchVANs();
    } catch (err) {
      console.error('Error creating VAN:', err);
      setCreateError(err.message || 'Failed to create VAN');
    } finally {
      setIsCreating(false);
    }
  };

  const handleVANConsole = (van) => {
    // TODO: Implement VAN Console functionality
    console.log('Open VAN Console for:', van);
  };

  const handleDeployClick = async (van) => {
    setVanToDeploy(van);
    setDeployModalOpen(true);
    setDeploymentTarget('standalone');
    
    // Fetch access points of type "van" from the VAN's backbone
    if (van.backbone) {
      try {
        setLoadingAccessPoints(true);
        const response = await fetch(`/api/v1alpha1/backbones/${van.backbone}/accesspoints`);
        
        if (response.ok) {
          const data = await response.json();
          // Filter for access points of type "van"
          const vanAPs = data.filter(ap => ap.kind === 'van');
          setVanAccessPoints(vanAPs);
        } else {
          console.error('Failed to fetch access points');
          setVanAccessPoints([]);
        }
      } catch (err) {
        console.error('Error fetching access points:', err);
        setVanAccessPoints([]);
      } finally {
        setLoadingAccessPoints(false);
      }
    }
  };

  const handleDeleteClick = (van) => {
    setVanToDelete(van);
    setDeleteModalOpen(true);
    setDeleteError(null);
  };

  const handleDeleteVAN = async () => {
    if (!vanToDelete) return;

    try {
      setIsDeleting(true);
      setDeleteError(null);
      
      const response = await fetch(`/api/v1alpha1/vans/${vanToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Close modal and refresh
      setDeleteModalOpen(false);
      setVanToDelete(null);
      
      // Refresh the VANs list
      fetchVANs();
    } catch (err) {
      console.error('Error deleting VAN:', err);
      setDeleteError(err.message || 'Failed to delete VAN');
    } finally {
      setIsDeleting(false);
    }
  };

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
    { key: 'networktype', header: 'Network Type' },
    { key: 'status', header: 'Status' },
    { key: 'starttime', header: 'Start Time' },
    { key: 'endtime', header: 'End Time' },
    { key: 'deletedelay', header: 'Delete Delay' },
    { key: 'actions', header: '' },
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
      networktype: van.networktype,
      status: status,
      starttime: van.starttime,
      endtime: van.endtime,
      deletedelay: van.deletedelay,
      actions: { van, status },
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
        <p>Manage Virtual Application Networks and their configurations.</p>
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
        <div>
          {selectedBackbone !== 'all' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <Button
                kind="primary"
                renderIcon={Add}
                onClick={() => setIsModalOpen(true)}
              >
                New VAN
              </Button>
            </div>
          )}
          <InlineNotification
            kind="info"
            title="No VANs found"
            subtitle={
              selectedBackbone === 'all'
                ? 'There are currently no VANs configured.'
                : 'Click "New VAN" to create the first VAN in this backbone.'
            }
            hideCloseButton
            style={{ marginBottom: '1rem' }}
          />
        </div>
      )}

      {!loading && !error && vans.length > 0 && (
        <DataTable rows={rows} headers={headers}>
          {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer
              title="Virtual Application Networks"
              description={`${vans.length} VAN(s) ${selectedBackbone === 'all' ? 'across all backbones' : 'in selected backbone'}`}
            >
              {selectedBackbone !== 'all' && (
                <TableToolbar>
                  <TableToolbarContent>
                    <Button
                      kind="primary"
                      renderIcon={Add}
                      onClick={() => setIsModalOpen(true)}
                    >
                      New VAN
                    </Button>
                  </TableToolbarContent>
                </TableToolbar>
              )}
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
                        if (cell.info.header === 'networktype') {
                          return (
                            <TableCell key={cell.id}>
                              {cell.value || 'unknown'}
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
                        if (cell.info.header === 'actions') {
                          const { van } = cell.value;
                          const showConsole = van.networktype === 'external';
                          const showDeploy = van.networktype === 'external';
                          
                          return (
                            <TableCell key={cell.id}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                {showDeploy && (
                                  <IconButton
                                    kind="ghost"
                                    label="Deploy VAN"
                                    tooltipPosition="top"
                                    onClick={() => handleDeployClick(van)}
                                    size="sm"
                                  >
                                    <Deploy />
                                  </IconButton>
                                )}
                                {showConsole && (
                                  <IconButton
                                    kind="ghost"
                                    label="VAN Console"
                                    tooltipPosition="top"
                                    onClick={() => handleVANConsole(van)}
                                    size="sm"
                                  >
                                    <Gui />
                                  </IconButton>
                                )}
                                <IconButton
                                  kind="ghost"
                                  label="Delete VAN"
                                  tooltipPosition="top"
                                  tooltipAlignment="end"
                                  onClick={() => handleDeleteClick(van)}
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

      <Modal
        open={isModalOpen}
        modalHeading="Create New VAN"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setIsModalOpen(false);
          setVanName('');
          setOwnerGroup('');
          setNetworkType('external');
          setStartDate(new Date());
          setStartTimeValue(new Date().toTimeString().slice(0, 5));
          setEndDate(null);
          setEndTimeValue('00:00');
          setDeleteDelay(0);
          setCreateError(null);
        }}
        onRequestSubmit={handleCreateVAN}
        primaryButtonDisabled={isCreating || !vanName.trim()}
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
          id="van-name"
          labelText="VAN Name"
          placeholder="Enter VAN name"
          value={vanName}
          onChange={(e) => setVanName(e.target.value)}
          disabled={isCreating}
          style={{ marginBottom: '1rem' }}
        />

        <OwnerGroupSelect
          id="van-owner-group"
          labelText="Owner group"
          value={ownerGroup}
          onChange={setOwnerGroup}
          disabled={isCreating}
          style={{ marginBottom: '1rem' }}
        />
        
        <RadioButtonGroup
          legendText="VAN Type"
          name="tenant-type"
          valueSelected={networkType}
          onChange={setNetworkType}
          style={{ marginBottom: '1rem' }}
        >
          <RadioButton
            labelText="Connect an existing Skupper VAN"
            value="external"
            id="type-external"
          />
          <RadioButton
            labelText="Create a tenant VAN on this service backbone"
            value="tenant"
            id="type-tenant"
          />
        </RadioButtonGroup>

        {networkType === 'tenant' && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <DatePicker
                datePickerType="single"
                dateFormat="m/d/Y"
                value={startDate}
                onChange={(dates) => {
                  if (dates && dates.length > 0) {
                    setStartDate(dates[0]);
                  }
                }}
              >
                <DatePickerInput
                  id="start-date"
                  labelText="Start Date"
                  placeholder="mm/dd/yyyy"
                  disabled={isCreating}
                />
              </DatePicker>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <TimePicker
                id="start-time"
                labelText="Start Time"
                value={startTimeValue}
                onChange={(e) => setStartTimeValue(e.target.value)}
                disabled={isCreating}
              >
                <TimePickerSelect
                  id="start-time-select"
                  labelText="Timezone"
                  disabled={isCreating}
                >
                  <SelectItem value="local" text="Local Time" />
                </TimePickerSelect>
              </TimePicker>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <DatePicker
                datePickerType="single"
                dateFormat="m/d/Y"
                value={endDate}
                onChange={(dates) => {
                  if (dates && dates.length > 0) {
                    setEndDate(dates[0]);
                  } else {
                    setEndDate(null);
                  }
                }}
              >
                <DatePickerInput
                  id="end-date"
                  labelText="End Date (Optional)"
                  placeholder="mm/dd/yyyy"
                  disabled={isCreating}
                />
              </DatePicker>
            </div>

            {endDate && (
              <div style={{ marginBottom: '1rem' }}>
                <TimePicker
                  id="end-time"
                  labelText="End Time"
                  value={endTimeValue}
                  onChange={(e) => setEndTimeValue(e.target.value)}
                  disabled={isCreating}
                >
                  <TimePickerSelect
                    id="end-time-select"
                    labelText="Timezone"
                    disabled={isCreating}
                  >
                    <SelectItem value="local" text="Local Time" />
                  </TimePickerSelect>
                </TimePicker>
              </div>
            )}

            <NumberInput
              id="delete-delay"
              label="Delete Delay (minutes)"
              helperText="Delay in minutes before deletion after end time"
              min={0}
              value={deleteDelay}
              onChange={(e, { value }) => setDeleteDelay(value)}
              disabled={isCreating || !endDate}
              style={{ marginBottom: '1rem' }}
            />
          </>
        )}
      </Modal>

      <Modal
        open={deleteModalOpen}
        danger
        modalHeading="Delete VAN"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setDeleteModalOpen(false);
          setVanToDelete(null);
          setDeleteError(null);
        }}
        onRequestSubmit={handleDeleteVAN}
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
          Are you sure you want to delete the VAN <strong>{vanToDelete?.name}</strong>?
          This action cannot be undone.
        </p>
      </Modal>

      <Modal
        open={deployModalOpen}
        modalHeading="Deploy VAN"
        primaryButtonText="Close"
        onRequestClose={() => {
          setDeployModalOpen(false);
          setVanToDeploy(null);
          setDeploymentTarget('standalone');
          setVanAccessPoints([]);
        }}
        onRequestSubmit={() => {
          setDeployModalOpen(false);
          setVanToDeploy(null);
          setDeploymentTarget('standalone');
          setVanAccessPoints([]);
        }}
      >
        <p style={{ marginBottom: '1rem' }}>
          Deploy VAN <strong>{vanToDeploy?.name}</strong>
        </p>
        
        <Select
          id="deployment-target"
          labelText="Deployment Target"
          value={deploymentTarget}
          onChange={(e) => setDeploymentTarget(e.target.value)}
          disabled={loadingAccessPoints}
          style={{ marginBottom: '1rem' }}
        >
          <SelectItem value="standalone" text="Standalone" />
          {vanAccessPoints.map((ap) => (
            <SelectItem
              key={ap.id}
              value={ap.id}
              text={`${ap.name || ap.id} (${ap.sitename || 'Unknown Site'})`}
            />
          ))}
        </Select>
        
        {loadingAccessPoints && (
          <p style={{ marginTop: '0.5rem', marginBottom: '1rem', color: '#525252', fontSize: '0.875rem' }}>
            Loading access points...
          </p>
        )}
        
        {vanToDeploy && (
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <h5 style={{ marginBottom: '0.5rem' }}>Download Configuration</h5>
            <Link
              href={
                deploymentTarget === 'standalone'
                  ? `/api/v1alpha1/vans/${vanToDeploy.id}/config/nonconnecting`
                  : `/api/v1alpha1/vans/${vanToDeploy.id}/config/connecting/${deploymentTarget}`
              }
              download={'onboard.yaml'}
            >
              Download VAN configuration
            </Link>
          </div>
        )}
        
        <p style={{ marginTop: '1rem', color: '#525252', fontStyle: 'italic' }}>
          Deployment functionality will be implemented here.
        </p>
      </Modal>
    </div>
  );
};

export default VANs;

// Made with Bob
