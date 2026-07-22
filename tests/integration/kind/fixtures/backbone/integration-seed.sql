-- integration test seed: one backbone, one interior site ready for bootstrap.
-- UUIDs must match tests/integration/kind/config.js
--
-- The Helm bootstrap root CA (secret vms-root-secret) is not tracked in
-- TlsCertificates by the MC; insert rows explicitly for integration tests.

INSERT INTO TlsCertificates (Id, IsCA, ObjectName, Label, SignedBy)
VALUES (
    '00000000-0000-4000-8000-000000000000'::uuid,
    true,
    'vms-root-secret',
    'Integration root CA (Kind bootstrap)',
    NULL
)
ON CONFLICT (Id) DO NOTHING;

INSERT INTO TlsCertificates (Id, IsCA, ObjectName, Label, SignedBy)
VALUES (
    '00000000-0000-4000-8000-000000000003'::uuid,
    false,
    'vms-site-cert-integration',
    'Integration site client cert',
    '00000000-0000-4000-8000-000000000000'::uuid
)
ON CONFLICT (Id) DO NOTHING;

INSERT INTO TlsCertificates (Id, IsCA, ObjectName, Label, SignedBy)
VALUES (
    '00000000-0000-4000-8000-000000000005'::uuid,
    false,
    'vms-access-00000000-0000-4000-8000-000000000004',
    'Integration manage access point cert',
    '00000000-0000-4000-8000-000000000000'::uuid
)
ON CONFLICT (Id) DO NOTHING;

INSERT INTO Backbones (Id, Name, Lifecycle, Certificate)
VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'integration-backbone',
    'ready',
    '00000000-0000-4000-8000-000000000000'::uuid
)
ON CONFLICT (Id) DO UPDATE SET
    lifecycle = EXCLUDED.lifecycle,
    certificate = EXCLUDED.certificate;

INSERT INTO InteriorSites (Id, Name, Lifecycle, Certificate, DeploymentState, TargetPlatform, Backbone)
VALUES (
    '00000000-0000-4000-8000-000000000002'::uuid,
    'site-a',
    'ready',
    '00000000-0000-4000-8000-000000000003'::uuid,
    'ready-bootstrap',
    'sk2',
    '00000000-0000-4000-8000-000000000001'::uuid
)
ON CONFLICT (Id) DO UPDATE SET
    lifecycle = EXCLUDED.lifecycle,
    deploymentstate = EXCLUDED.deploymentstate,
    certificate = EXCLUDED.certificate,
    backbone = EXCLUDED.backbone;

INSERT INTO BackboneAccessPoints (Id, Name, Kind, Lifecycle, InteriorSite, AccessType, Certificate, Hostname, Port)
VALUES (
    '00000000-0000-4000-8000-000000000004'::uuid,
    'manage',
    'manage',
    'ready',
    '00000000-0000-4000-8000-000000000002'::uuid,
    'local',
    '00000000-0000-4000-8000-000000000005'::uuid,
    '',
    '5671'
)
ON CONFLICT (Id) DO UPDATE SET
    lifecycle = EXCLUDED.lifecycle,
    kind = EXCLUDED.kind,
    interiorsite = EXCLUDED.interiorsite,
    accesstype = EXCLUDED.accesstype,
    certificate = EXCLUDED.certificate,
    hostname = EXCLUDED.hostname,
    port = EXCLUDED.port;
