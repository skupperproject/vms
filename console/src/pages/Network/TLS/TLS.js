import React, { useState, useEffect } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandRow,
  TableExpandedRow,
  TableExpandHeader,
  Tag,
  InlineNotification,
  Loading,
  OverflowMenu,
  OverflowMenuItem,
} from '@carbon/react';
import { Certificate, DocumentSigned } from '@carbon/icons-react';

const TLS = () => {
  const [certificates, setCertificates] = useState([]);
  const [childCerts, setChildCerts] = useState({});
  const [loadingChildren, setLoadingChildren] = useState({});
  const [expandedRows, setExpandedRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/v1alpha1/certs');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setCertificates(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChildCertificates = async (issuerId) => {
    if (childCerts[issuerId]) {
      return; // Already fetched
    }

    try {
      setLoadingChildren(prev => ({ ...prev, [issuerId]: true }));
      const response = await fetch(
        `/api/v1alpha1/certs?signedby=${issuerId}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setChildCerts(prev => ({ ...prev, [issuerId]: data }));
    } catch (err) {
      console.error('Error fetching child certificates:', err);
    } finally {
      setLoadingChildren(prev => ({ ...prev, [issuerId]: false }));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
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

  const getExpirationTagType = (expirationDate) => {
    if (!expirationDate) return 'gray';
    const date = new Date(expirationDate);
    const now = new Date();
    const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'red';
    if (diffDays <= 7) return 'red';
    if (diffDays <= 14) return 'yellow';
    return 'green';
  };

  const renderIcon = (isCA) => {
    return isCA ? (
      <Certificate size={20} style={{ marginRight: '0.5rem' }} />
    ) : (
      <DocumentSigned size={20} style={{ marginRight: '0.5rem' }} />
    );
  };

  const handleRevokeAndRotate = (cert) => {
    // TODO: Implement revoke and rotate functionality
    console.log('Revoke and Rotate:', cert);
  };

  const handleRevoke = (cert) => {
    // TODO: Implement revoke functionality
    console.log('Revoke:', cert);
  };

  const headers = [
    { key: 'type', header: 'Type' },
    { key: 'label', header: 'Label' },
    { key: 'expiration', header: 'Expiration' },
    { key: 'renewaltime', header: 'Renewal Time' },
    { key: 'generation', header: 'Gen' },
    { key: 'actions', header: '' },
  ];

  // Recursive component to render certificate rows at any depth
  const CertificateRow = ({ cert, level = 0 }) => {
    const isExpanded = expandedRows[cert.id] || false;
    const children = childCerts[cert.id] || [];
    const isLoadingChildren = loadingChildren[cert.id] || false;

    const handleExpand = () => {
      setExpandedRows(prev => ({
        ...prev,
        [cert.id]: !prev[cert.id]
      }));
      
      if (!childCerts[cert.id] && !isExpanded) {
        fetchChildCertificates(cert.id);
      }
    };

    const indentStyle = {
      paddingLeft: `${level * 2}rem`
    };

    if (cert.isca) {
      // CA certificates - use TableExpandRow
      return (
        <React.Fragment key={cert.id}>
          <TableExpandRow
            isExpanded={isExpanded}
            onExpand={handleExpand}
          >
            <TableCell>
              <div style={{ display: 'flex', alignItems: 'center', ...indentStyle }}>
                {renderIcon(true)}
                Certificate Authority
              </div>
            </TableCell>
            <TableCell>{cert.label}</TableCell>
            <TableCell>
              <Tag type={getExpirationTagType(cert.expiration)}>
                {formatRelativeTime(cert.expiration)}
              </Tag>
            </TableCell>
            <TableCell>{formatDate(cert.renewaltime)}</TableCell>
            <TableCell>{cert.generation}</TableCell>
            <TableCell>
              <OverflowMenu size="sm" flipped>
                <OverflowMenuItem
                  itemText="Revoke and Rotate"
                  onClick={() => handleRevokeAndRotate(cert)}
                />
                <OverflowMenuItem
                  itemText="Revoke"
                  onClick={() => handleRevoke(cert)}
                />
              </OverflowMenu>
            </TableCell>
          </TableExpandRow>
          {isExpanded && isLoadingChildren && (
            <TableExpandedRow colSpan={headers.length + 1}>
              <div style={{ padding: '1rem' }}>
                <Loading description="Loading signed certificates..." small />
              </div>
            </TableExpandedRow>
          )}
          {isExpanded && !isLoadingChildren && children.length === 0 && (
            <TableExpandedRow colSpan={headers.length + 1}>
              <div style={{ padding: '1rem', color: 'var(--cds-text-secondary)' }}>
                No certificates signed by this CA
              </div>
            </TableExpandedRow>
          )}
          {isExpanded && !isLoadingChildren && children.length > 0 && children.map((childCert) => (
            <CertificateRow
              key={childCert.id}
              cert={childCert}
              level={level + 1}
            />
          ))}
        </React.Fragment>
      );
    } else {
      // Non-CA certificates - always need empty cell for expand column
      return (
        <TableRow key={cert.id}>
          <TableCell />
          <TableCell>
            <div style={{ display: 'flex', alignItems: 'center', ...indentStyle }}>
              {renderIcon(false)}
              Certificate
            </div>
          </TableCell>
          <TableCell>{cert.label}</TableCell>
          <TableCell>
            <Tag type={getExpirationTagType(cert.expiration)}>
              {formatRelativeTime(cert.expiration)}
            </Tag>
          </TableCell>
          <TableCell>{formatDate(cert.renewaltime)}</TableCell>
          <TableCell>{cert.generation}</TableCell>
          <TableCell>
            <OverflowMenu size="sm" flipped>
              <OverflowMenuItem
                itemText="Revoke and Rotate"
                onClick={() => handleRevokeAndRotate(cert)}
              />
              <OverflowMenuItem
                itemText="Revoke"
                onClick={() => handleRevoke(cert)}
              />
            </OverflowMenu>
          </TableCell>
        </TableRow>
      );
    }
  };

  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/tls" isCurrentPage>
          TLS
        </BreadcrumbItem>
      </Breadcrumb>
      
      <div className="page-header">
        <h1>TLS Certificates</h1>
        <p>Manage Transport Layer Security certificates and certificate authorities. Click on CAs to view signed certificates.</p>
      </div>

      {loading && (
        <Loading description="Loading certificates..." withOverlay={false} />
      )}

      {error && (
        <InlineNotification
          kind="error"
          title="Error loading certificates"
          subtitle={error}
          onCloseButtonClick={() => setError(null)}
          style={{ marginBottom: '1rem' }}
        />
      )}

      {!loading && !error && certificates.length === 0 && (
        <InlineNotification
          kind="info"
          title="No certificates found"
          subtitle="There are currently no certificates configured."
          hideCloseButton
          style={{ marginBottom: '1rem' }}
        />
      )}

      {!loading && !error && certificates.length > 0 && (
        <TableContainer title="Certificates" description="Hierarchical view of certificate authorities and certificates">
          <Table>
            <TableHead>
              <TableRow>
                <TableExpandHeader enableToggle />
                {headers.map((header) => (
                  <TableHeader key={header.key}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {certificates.map((cert) => (
                <CertificateRow key={cert.id} cert={cert} level={0} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
};

export default TLS;

// Made with Bob
