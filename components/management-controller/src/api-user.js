/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/

"use strict";

import { IncomingForm } from 'formidable';
import { ClientFromPool, queryWithContext } from './db.js';
import { Log } from '@skupperx/modules/log'
import { IsValidUuid, ValidateAndNormalizeFields, UniquifyName } from '@skupperx/modules/util'

const API_PREFIX = '/api/v1alpha1/';

const createVan = async function(req, res) {
    const bid = req.params.bid;
    let returnStatus;
    const form = new IncomingForm();
    try {
        if (!IsValidUuid(bid)) {
            throw new Error('Backbone-Id is not a valid uuid');
        }

        const [fields, files] = await form.parse(req);
        const norm = ValidateAndNormalizeFields(fields, {
            'name'        : {type: 'dnsname',    optional: false},
            'tenant'      : {type: 'boolean',    optional: false},
            'starttime'   : {type: 'timestampz', optional: true, default: null},
            'endtime'     : {type: 'timestampz', optional: true, default: null},
            'deletedelay' : {type: 'interval',   optional: true, default: null},
        });

        const client = await ClientFromPool();
        try {
            returnStatus = 500;

            const vanId = await queryWithContext(req, client, async (client, credentials) => {
                //
                // If the name is not unique within the backbone, modify it to be unique.
                //
                const namesResult = await client.query("SELECT Name FROM ApplicationNetworks WHERE Backbone = $1", [bid]);
                let existingNames = [];
                for (const row of namesResult.rows) {
                    existingNames.push(row.name);
                }
                const uniqueName = UniquifyName(norm.name, existingNames);

                let extraCols = "";
                let extraVals = "";

                //
                // Handle the optional fields
                //
                if (norm.starttime) {
                    extraCols += ', StartTime';
                    extraVals += `, '${norm.starttime}'`;
                }

                if (norm.endtime) {
                    extraCols += ', EndTime';
                    extraVals += `, '${norm.endtime}'`;
                }

                if (norm.deletedelay) {
                    extraCols += ', DeleteDelay';
                    extraVals += `, '${norm.deletedelay}'`;
                }

                //
                // Create the application network
                //
                const ownerId = credentials.userId;
                const ownerGroups = credentials.userGroups;
                const result = await client.query(
                    `INSERT INTO ApplicationNetworks(Name, TenantNetwork, Backbone${extraCols}, Owner, OwnerGroups) VALUES ($1, $2, $3${extraVals}, $4, $5) RETURNING Id`,
                    [uniqueName, norm.tenant, bid, ownerId, ownerGroups]
                );
                const vanId = result.rows[0].id;
                
                //
                // Create network credentials for the VAN.
                //
                await client.query("INSERT INTO NetworkCredentials (Name, MemberOf) VALUES ($1, $2)", [uniqueName, vanId]);

                return vanId
            })

            returnStatus = 201;
            res.status(returnStatus).json({id: vanId});
        } catch (error) {
            await client.query("ROLLBACK");
            res.status(returnStatus).send(error.stack);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message: error.message });
    }

    return returnStatus;
}

const createInvitation = async function(req, res) {
    const vid = req.params.vid;
    let returnStatus;
    const form = new IncomingForm();
    try {
        if (!IsValidUuid(vid)) {
            throw new Error('VAN-Id is not a valid uuid');
        }

        const [fields, files] = await form.parse(req)
        const norm = ValidateAndNormalizeFields(fields, {
            'name'            : {type: 'dnsname',    optional: false},
            'claimaccess'     : {type: 'uuid',       optional: false},
            'primaryaccess'   : {type: 'uuid',       optional: false},
            'secondaryaccess' : {type: 'uuid',       optional: true, default: null},
            'joindeadline'    : {type: 'timestampz', optional: true, default: null},
            'siteclass'       : {type: 'string',     optional: true, default: null},
            'instancelimit'   : {type: 'number',     optional: true, default: null},
            'interactive'     : {type: 'bool',       optional: true, default: false},
            'prefix'          : {type: 'dnsname',    optional: true, default: null},
        });

        const client = await ClientFromPool();
        try {

            const invitationId = await queryWithContext(req, client, async (client) => {
                //
                // If the name is not unique within the backbone, modify it to be unique.
                //
                const namesResult = await client.query("SELECT Name FROM MemberInvitations WHERE MemberOf = $1", [vid]);
                let existingNames = [];
                for (const row of namesResult.rows) {
                    existingNames.push(row.name);
                }
                const uniqueName = UniquifyName(norm.name, existingNames);

                let extraCols = "";
                let extraVals = "";

                //
                // Handle the optional fields
                //
                if (norm.siteclass) {
                    extraCols += ', MemberClasses';
                    extraVals += `, ARRAY['${norm.siteclass}']`;
                }

                if (norm.instancelimit) {
                    extraCols += ', InstanceLimit';
                    extraVals += `, ${norm.instancelimit}`;
                }

                if (norm.joindeadline) {
                    extraCols += ', JoinDeadline';
                    extraVals += `, '${norm.joindeadline}'`;
                }

                if (norm.prefix) {
                    extraCols += ', MemberNamePrefix';
                    extraVals += `, '${norm.prefix}'`;
                }

                //
                // Create the application network
                //
                const result = await client.query(`INSERT INTO MemberInvitations(Name, MemberOf, ClaimAccess, InteractiveClaim${extraCols}) ` +
                                                `VALUES ($1, $2, $3, $4${extraVals}) RETURNING Id`, [uniqueName, vid, norm.claimaccess, norm.interactive]);
                const invitationId = result.rows[0].id;

                await client.query("INSERT INTO EdgeLinks(AccessPoint, EdgeToken, Priority) VALUES ($1, $2, 1)", [norm.primaryaccess, invitationId]);

                if (norm.secondaryaccess) {
                    await client.query("INSERT INTO EdgeLinks(AccessPoint, EdgeToken, Priority) VALUES ($1, $2, 2)", [norm.secondaryaccess, invitationId]);
                }

                return invitationId
            })

            returnStatus = 201;
            res.status(returnStatus).json({id: invitationId});
        } catch (error) {
            await client.query("ROLLBACK");
            returnStatus = 500
            res.status(returnStatus).send(error.message);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message: error.message });
    }

    return returnStatus;
}

const readVan = async function(req, res) {
    let returnStatus = 200;
    const vid = req.params.vid;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query(
                "SELECT ApplicationNetworks.*, Backbones.Id as backboneid, Backbones.Name as backbonename " +
                "FROM ApplicationNetworks " +
                "JOIN Backbones ON ApplicationNetworks.Backbone = Backbones.Id WHERE ApplicationNetworks.Id = $1", [vid]
            );
        })

        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).end();
        }
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const readInvitation = async function(req, res) {
    let returnStatus = 200;
    const iid = req.params.iid;
    const client = await ClientFromPool();
    try {
        
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT MemberInvitations.Name, MemberInvitations.LifeCycle, MemberInvitations.Failure, ApplicationNetworks.Name as vanname, JoinDeadline, InstanceLimit, InstanceCount, InteractiveClaim as interactive FROM MemberInvitations " +
                                      "JOIN ApplicationNetworks ON ApplicationNetworks.Id = MemberInvitations.MemberOf WHERE MemberInvitations.Id = $1", [iid]);
        })
        
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).end();
        }
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const readVanMember = async function(req, res) {
    let returnStatus = 200;
    const mid = req.params.mid;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT MemberSites.*, ApplicationNetworks.Name as vanname FROM MemberSites " +
                                      "JOIN ApplicationNetworks ON ApplicationNetworks.Id = MemberSites.MemberOf WHERE MemberSites.Id = $1", [mid]);
        })

        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).end();
        }
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listVans = async function(req, res) {
    const bid = req.params.bid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT Id, Name, LifeCycle, Failure, StartTime, EndTime, DeleteDelay, TenantNetwork FROM ApplicationNetworks WHERE Backbone = $1", [bid])
        })

        res.status(returnStatus).json(result.rows);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listAllVans = async function(req, res) {
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query(
                "SELECT ApplicationNetworks.Id, Backbone, Backbones.Name as backbonename, ApplicationNetworks.Name, TenantNetwork, " +
                "ApplicationNetworks.LifeCycle, ApplicationNetworks.Failure, StartTime, EndTime, DeleteDelay, Connected " +
                "FROM ApplicationNetworks " +
                "JOIN Backbones ON Backbones.Id = Backbone"
            )
        })
        res.status(returnStatus).json(result.rows);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listInvitations = async function(req, res) {
    const vid = req.params.vid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT Id, Name, LifeCycle, Failure, JoinDeadline, MemberClasses, InstanceLimit, InstanceCount, FetchCount, InteractiveClaim as interactive FROM MemberInvitations WHERE MemberOf = $1", [vid]);
        })
        res.status(returnStatus).json(result.rows);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listVanMembers = async function(req, res) {
    const vid = req.params.vid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT MemberSites.*, MemberInvitations.name as invitationname " +
                                      "FROM MemberSites " +
                                      "JOIN MemberInvitations ON MemberInvitations.Id = Invitation " +
                                      "WHERE MemberSites.MemberOf = $1", [vid]);
        })
        res.status(returnStatus).json(result.rows);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const deleteVan = async function(req, res) {
    const vid = req.params.vid;
    let returnStatus = 204;
    const client = await ClientFromPool();
    try {
        await queryWithContext(req, client, async (client) => {
            const memberSiteId = await client.query("SELECT Id FROM MemberSites WHERE MemberOf = $1 LIMIT 1", [vid]);
            if (memberSiteId.rowCount == 0) {
                const delResult = await client.query("DELETE FROM ApplicationNetworks WHERE Id = $1 RETURNING Certificate", [vid]);
                if (delResult.rowCount == 1) {
                    if (delResult.certificate) {
                        await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [delResult.certificate]);
                    }
                    res.status(returnStatus).send("Application network deleted");
                } else {
                    await client.query("ROLLBACK");
                    returnStatus = 404;
                    res.status(returnStatus).send("Application network not found");
                }
            } else {
                await client.query("ROLLBACK");
                returnStatus = 400;
                res.status(returnStatus).send('Cannot delete application network because is still has members');
            }
        })
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const deleteInvitation = async function(req, res) {
    const iid = req.params.iid;
    let returnStatus = 204;
    const client = await ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT id FROM MemberSites WHERE Invitation = $1 LIMIT 1", [iid]);
        if (result.rowCount == 0) {
            const invResult = await client.query("DELETE FROM MemberInvitations WHERE Id = $1 RETURNING Certificate", [iid]);
            if (invResult.rowCount == 1) {
                const row = invResult.rows[0];
                if (row.certificate) {
                    await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.certificate]);
                }
            }
            res.status(returnStatus).end();
        } else {
            returnStatus = 400;
            res.status(returnStatus).send('Cannot delete invitation because members still exist that use the invitation');
        }
        await client.query("COMMIT");

        await queryWithContext(req, client, async (client) => {
            const result = await client.query("SELECT id FROM MemberSites WHERE Invitation = $1 LIMIT 1", [iid]);
            if (result.rowCount == 0) {
                const invResult = await client.query("DELETE FROM MemberInvitations WHERE Id = $1 RETURNING Certificate", [iid]);
                if (invResult.rowCount == 1) {
                    const row = invResult.rows[0];
                    if (row.certificate) {
                        await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.certificate]);
                    }
                }
                res.status(returnStatus).end();
            } else {
                returnStatus = 400;
                res.status(returnStatus).send('Cannot delete invitation because members still exist that use the invitation');
            }
        })
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const expireInvitation = async function(req, res) {
    const iid = req.params.iid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("UPDATE MemberInvitations SET Lifecycle = 'expired', Failure = 'Expired via API' WHERE Id = $1 RETURNING Id", [iid]);
        })
        if (result.rowCount == 0) {
            returnStatus = 404;
        }
        res.status(returnStatus).end();
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const readCertificate = async function(req, res) {
    const cid = req.params.cid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT * FROM TlsCertificates WHERE Id = $1", [cid]);
        })
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).end();
        }
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const evictMember = async function(req, res) {
    const mid = req.params.mid;
    let returnStatus = 501;
    res.status(returnStatus).send("Member eviction not implemented");
    return returnStatus;
}

const evictVan = async function(req, res) {
    const vid = req.params.vid;
    let returnStatus = 501;
    res.status(returnStatus).send("Network eviction not implemented");
    return returnStatus;
}

const listClaimAccessPoints = async function(req, res, ref) {
    const bid = req.params.bid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT BackboneAccessPoints.Name as accessname, BackboneAccessPoints.Id as accessid FROM InteriorSites " +
                                      `JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = InteriorSites.${ref} ` +
                                      "WHERE InteriorSites.Backbone = $1", [bid]);
        })
        let data = [];
        for (const row of result.rows) {
            data.push({
                id   : row.accessid,
                name : row.accessname
            });
        }
        res.status(returnStatus).json(data);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

export async function Initialize(api, keycloak) {
    Log('[API User interface starting]');

    //========================================
    // Application Networks
    //========================================

    // CREATE
    api.post(API_PREFIX + 'backbones/:bid/vans', keycloak.protect('realm:van-owner'), async (req, res) => {
        await createVan(req, res);
    });

    // READ
    api.get(API_PREFIX + 'vans/:vid', keycloak.protect('realm:van-owner'), async (req, res) => {
        await readVan(req, res);
    });

    // LIST
    api.get(API_PREFIX + 'backbones/:bid/vans', keycloak.protect('realm:van-owner'), async (req, res) => {
        await listVans(req, res);
    });

    // LIST ALL
    api.get(API_PREFIX + 'vans', keycloak.protect('realm:van-owner'), async (req, res) => {
        await listAllVans(req, res);
    });

    // DELETE
    api.delete(API_PREFIX + 'vans/:vid', keycloak.protect('realm:van-owner'), async (req, res) => {
        await deleteVan(req, res);
    });

    // COMMANDS
    api.put(API_PREFIX + 'vans/:vid/evict', keycloak.protect('realm:van-owner'), async (req, res) => {
        await evictVan(req, res);
    });

    //========================================
    // Invitations
    //========================================

    // CREATE
    api.post(API_PREFIX + 'vans/:vid/invitations', keycloak.protect('realm:van-owner'), async (req, res) => {
        await createInvitation(req, res);
    });

    // READ
    api.get(API_PREFIX + 'invitations/:iid', keycloak.protect('realm:van-owner'), async (req, res) => {
        await readInvitation(req, res);
    });

    // LIST
    api.get(API_PREFIX + 'vans/:vid/invitations', keycloak.protect('realm:van-owner'), async (req, res) => {
        await listInvitations(req, res);
    });

    // DELETE
    api.delete(API_PREFIX + 'invitations/:iid', keycloak.protect('realm:van-owner'), async (req, res) => {
        await deleteInvitation(req, res);
    });

    // COMMANDS
    api.put(API_PREFIX + 'invitations/:iid/expire', keycloak.protect('realm:van-owner'), async (req, res) => {
        await expireInvitation(req, res);
    })

    //========================================
    // Member Sites
    //========================================

    // READ
    api.get(API_PREFIX + 'members/:mid', keycloak.protect('realm:van-owner'), async (req, res) => {
        await readVanMember(req, res);
    });

    // LIST
    api.get(API_PREFIX + 'vans/:vid/members', keycloak.protect('realm:van-owner'), async (req, res) => {
        await listVanMembers(req, res);
    });

    // COMMANDS
    api.put(API_PREFIX + 'members/:mid/evict', keycloak.protect('realm:van-owner'), async (req, res) => {
        await evictMember(req, res);
    });

    //========================================
    // TLS Certificates
    //========================================
    api.get(API_PREFIX + 'tls-certificates/:cid', async (req, res) => {
        await readCertificate(req, res);
    });

    //========================================
    // Queries for filling forms
    //========================================

    // Claim Access Points
    api.get(API_PREFIX + 'backbones/:bid/access/claim', keycloak.protect('realm:van-owner'), async (req, res) => {
        await listClaimAccessPoints(req, res, 'ClaimAccess');
    });

    // Member Access Points
    api.get(API_PREFIX + 'backbones/:bid/access/member', keycloak.protect('realm:van-owner'), async (req, res) => {
        await listClaimAccessPoints(req, res, 'MemberAccess');
    });
}