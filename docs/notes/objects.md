# State and Configuration Objects

## Certificates for sites and access points

There needs to be a notion of a "container" for certificate credentials so that there is a stable part of the data architecture during a certificate rotation.  Rather than formalize a "certificate container", the InteriorSite, MemberSite, and InteriorAccessPoint will serve as a container for their respective TlsCertificates.  Note that the TlsCertificate will be replaced with a new one at renewal-time during a rotation.

In practical terms, this means that SslProfiles, configured on the router pods, shall be correlated with the containing database record, not the TlsCertificate used to populate the SslProfile.  During rotation, the SslProfile shall be overwritten with the new certificate data and its rotation ordinals updated.

For the purpose of deriving values for the ordinals in the SslProfile (current version, last-valid-version), the TlsCertificate records shall have new attributes added:

  - RotationOrdinal - An ordinal that is incremented in the superceding TlsCertificate when a new certificate is generated to supercede an older one.
  - Supercedes - A reference to the TlsCertificate that was superceded when creating this TlsCertificate.

  Invariant:  this.RotationOrdinal = this.Supercedes.RotationOrdinal + 1

  Note that TlsCertificates will typically be kept in the database until they expire.

## Site

Backbone sites can have the full complement of secret and connection types.  Member sites will only have links (no access-points).

### TLS Secrets

#### Direction
Management-controller to site-controller

#### Sync Payload

Record key:
 - `tls-site-<site-id>`
 - `tls-server-<access-point-id>`

Hashed payload record:
 - ordinal
 - lastValid
 - ca.crt  - From secret.data
 - tls.crt - From secret.data
 - tls.key - From secret.data

#### Target Object
```
apiVersion: v1
kind: Secret
metadata:
  name: skx-site-<site-id> | skx-access-<access-point-id>
  annotations:
    skx/tls-ordinal: <ordinal>
    skx/tls-last-valid: <lastValid>
    skx/state-key: tls-site-<site-id> | tls-server-<access-point-id>
    skx/state-hash: <hash>
    skx/state-dir: remote
data:
  ca.crt: ...
  tls.crt: ...
  tls.key: ...
```

The tls-ordinal and tls-oldest-valid annotations are used to manage the rotation and expiration of certificates.  When a new certificate is generated for the profile, the tls-ordinal is incremented.  The tls-oldest-valid ordinal is incremented when the certificate associated with the ordinal expires.  This may optionally be used by the router to close open connections that are still using the expired certificate.

### Access Points

#### Direction
Management-controller to site-controller

#### Sync Payload

Record key:
 - `access-<access-point-id>`

Hashed payload record:
 - kind - {`manage`, `peer`, `claim`, `member`, `van`}
 - accessType - {`local`, `loadbalancer`, `route`}
 - bindhost - optional hostname for socket binding

#### Target Object

The target output depends on the sync data.  Refer to the following table:

  | kind   | CR-kind       | role-name    |
  | ------ | ------------- | ------------ |
  | manage | RouterAccess  | normal       |
  | peer   | RouterAccess  | inter-router |
  | claim  | RouterAccess  | normal       |
  | member | RouterAccess  | edge         |
  | van    | NetworkAccess | N/A          |

When the CR kind is `RouterAccess`, the object is generated like this:
```
apiVersion: skupper.io/v2alpha1
kind: RouterAccess
metadata:
  name skx-access-<access-point-id>
  annotations:
    skx/state-id: Database ID of the associated AccessPoint
    skx/state-key: access-<access-point-id>
    skx/state-hash: <hash>
    skx/state-dir: remote
spec:
  generateTlsCredentials: false
  roles:
  - name: <role-name>
  tlsCredentials: skx-access-<access-point-id>
  bindHost: <bindhost>
  accessType: <accessType>
```

When the CR kind is `NetworkAccess`, the object looks like this:
```
apiVersion: skupper.io/v2alpha1
kind: NetworkAccess
metadata:
  name skx-access-<access-point-id>
  annotations:
    skx/state-id: Database ID of the associated AccessPoint
    skx/state-key: access-<access-point-id>
    skx/state-hash: <hash>
    skx/state-dir: remote
spec:
  generateTlsCredentials: false
  tlsCredentials: skx-access-<access-point-id>
  bindHost: <bindhost>
  accessType: <accessType>
```

### Access Point Status

#### Direction
Site-controller to management-controller

#### Sync Payload

Record key:
 - `accessstatus-<access-point-id>`

Hashed payload record:
 - host
 - port

#### Target Object

The target of access point status records is the management-controller database.  The host and port attributes of the BackboneAccessPoints table are populated using this sync payload.

### Links

#### Direction
Management-controller to site-controller

#### Sync Payload

Record key:
 - `link-<link-id>`

Hashed payload record:
 - host
 - port
 - cost

#### Target Object

```
apiVersion: skupper.io/v2alpha1
kind: Link
metadata:
  name: skx-link-<link-id>
spec:
  endpoints:
  - group: skupper-router
    host: <host>
    name: inter-router
    port: <port>
  tlsCredentials: skx-site-<local-site-id>
  cost: <cost>
```
