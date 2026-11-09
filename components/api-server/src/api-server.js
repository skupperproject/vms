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

import express from "express";
import { initialize } from "express-openapi";
import morgan from "morgan";
import cors from "cors";
import { Log } from "@vms/modules/log";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import fs from "node:fs";
import { UniquifyName } from "@vms/modules/util";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiSpecPath = path.join(__dirname, "../bundle.yaml");

const API_PREFIX = "/api/v1alpha1";
const API_PORT = Number(process.env.VMS_API_PORT) || 8085;

const pool = new Pool({ user: "postgres", password: process.env.PGPASSWORD });

// APPLICATION NETWORKS ================================

const listApplicationNetworks = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM ApplicationNetwork");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createApplicationNetwork = async function (req, res) {
    let statusCode;
    const { name, network, vanid, starttime, endtime, deletedelay, owner } = req.body;
    try {
        const networkResult = await pool.query("SELECT Id FROM Network WHERE Id = $1", [network]);
        if (networkResult.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Referenced network not found: ${network}` });
        }

        const namesResult = await pool.query(
            "SELECT Name FROM ApplicationNetwork WHERE Network = $1",
            [network]
        );

        // If the name is not unique within the network, modify it to be unique.
        const existingNames = namesResult.rows.map((row) => row.name);
        const uniqueName = UniquifyName(name, existingNames);

        const result = await pool.query(
            `INSERT INTO ApplicationNetwork(Name, Network, VanId, StartTime, EndTime, DeleteDelay, Owner) ` +
                `VALUES ($1, $2, $3, COALESCE($4, now()), $5, COALESCE($6, '0 minutes'::interval), $7) RETURNING Id`,
            [
                uniqueName,
                network,
                vanid ?? null,
                starttime ?? null,
                endtime ?? null,
                deletedelay ?? null,
                owner ?? null,
            ]
        );

        statusCode = 201;
        res.status(statusCode).json({ id: result.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readApplicationNetwork = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM ApplicationNetwork WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Application network not found: ${id}` });
        }
        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const updateApplicationNetwork = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    const { name, vanid, starttime, endtime, deletedelay, owner } = req.body;
    try {
        const result = await pool.query(
            "UPDATE ApplicationNetwork SET Name = COALESCE($1, Name), VanId = COALESCE($2, VanId), StartTime = COALESCE($3, StartTime), EndTime = COALESCE($4, EndTime), DeleteDelay = COALESCE($5, DeleteDelay), Owner = COALESCE($6, Owner) WHERE Id = $7 RETURNING *",
            [
                name ?? null,
                vanid ?? null,
                starttime ?? null,
                endtime ?? null,
                deletedelay ?? null,
                owner ?? null,
                id,
            ]
        );

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Application network not found: ${id}` });
        }

        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteApplicationNetwork = async function (req, res) {
    let statusCode = 204;
    const id = req.params.id;
    try {
        const result = await pool.query("DELETE FROM ApplicationNetwork WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Application network not found: ${id}` });
        }
        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// APPLICATION NETWORK LOCATIONS ================================

const listApplicationNetworkLocations = async function (req, res) {
    let statusCode = 200;
    const anid = req.params.anid;
    try {
        const parent = await pool.query("SELECT Id FROM ApplicationNetwork WHERE Id = $1", [anid]);
        if (parent.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Application network not found: ${anid}` });
        }
        const result = await pool.query(
            "SELECT * FROM ApplicationNetworkLocation WHERE ApplicationNetwork = $1",
            [anid]
        );
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readApplicationNetworkLocation = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM ApplicationNetworkLocation WHERE Id = $1", [
            id,
        ]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Application Network Location not found: ${id}` });
        }

        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createApplicationNetworkLocation = async function (req, res) {
    let statusCode;
    const anid = req.params.anid;
    const { location, locationselector, permittedlistenerkeys, permittedconnectorkeys } = req.body;
    try {
        const appNetworkResult = await pool.query(
            "SELECT Id FROM ApplicationNetwork WHERE Id = $1",
            [anid]
        );
        if (appNetworkResult.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Referenced application network not found: ${anid}` });
        }

        const locationResult = await pool.query("SELECT Id FROM Location WHERE Id = $1", [
            location,
        ]);
        if (locationResult.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Referenced location not found: ${location}` });
        }

        const result = await pool.query(
            "INSERT INTO ApplicationNetworkLocation(ApplicationNetwork, Location, LocationSelector, PermittedListenerKeys, PermittedConnectorKeys) " +
                "VALUES ($1, $2, $3, $4, $5) RETURNING Id",
            [anid, location, locationselector, permittedlistenerkeys, permittedconnectorkeys]
        );

        statusCode = 201;
        res.status(statusCode).json({ id: result.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const updateApplicationNetworkLocation = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    const { locationselector, permittedlistenerkeys, permittedconnectorkeys } = req.body;
    try {
        const result = await pool.query(
            `UPDATE ApplicationNetworkLocation SET
                LocationSelector = COALESCE($1, LocationSelector),
                PermittedListenerKeys = COALESCE($2, PermittedListenerKeys),
                PermittedConnectorKeys = COALESCE($3, PermittedConnectorKeys)
                WHERE Id = $4
                RETURNING *`,
            [
                locationselector ?? null,
                permittedlistenerkeys ?? null,
                permittedconnectorkeys ?? null,
                id,
            ]
        );
        if (result.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Application network location not found: ${id}` });
        }
        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteApplicationNetworkLocation = async function (req, res) {
    let statusCode = 204;
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM ApplicationNetworkLocation WHERE Id = $1", [
            id,
        ]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Application network location not found: ${id}` });
        }
        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// DEPLOYMENT TARGETS ================================

const listDeploymentTargets = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM DeploymentTarget");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
    return statusCode;
};

const readDeploymentTarget = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM DeploymentTarget WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Deployment target not found: ${id}` });
        }
        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
    return statusCode;
};

const pushToDeploymentTarget = async function (req, res) {
    // STUBBED
};

// FOOTPRINTS ================================

const listFootprints = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM Footprint");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
    return statusCode;
};

const readFootprint = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM Footprint WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Footprint not found: ${id}` });
        }
        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// LOCATIONS ================================

const listLocations = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM Location");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createLocation = async function (req, res) {
    let statusCode;
    const { name, description, labels } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO Location(Name, Description, Labels) VALUES ($1, $2, $3) RETURNING Id`,
            [name, description, labels]
        );
        statusCode = 201;
        res.status(statusCode).json({ id: result.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readLocation = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM Location WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Location not found: ${id}` });
        }

        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const updateLocation = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    const { name, description, labels } = req.body;
    try {
        const result = await pool.query(
            `UPDATE Location SET
            Name = COALESCE($1, Name),
            Description = COALESCE($2, Description),
            Labels = COALESCE($3, Labels)
            WHERE Id = $4 RETURNING *`,
            [name ?? null, description ?? null, labels ?? null, id]
        );

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Location not found: ${id}` });
        }
        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteLocation = async function (req, res) {
    let statusCode = 204;
    const id = req.params.id;
    try {
        const result = await pool.query("DELETE FROM Location WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Location not found: ${id}` });
        }

        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// NETWORKS ================================

const listNetworks = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM Network");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createNetwork = async function (req, res) {
    let statusCode = 201;
    const { name, type, owner } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO Network(Name, Type, Owner) VALUES ($1, $2, $3) RETURNING Id",
            [name, type, owner]
        );
        res.status(statusCode).json({ id: result.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readNetwork = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM Network WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Network not found: ${id}` });
        }

        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteNetwork = async function (req, res) {
    let statusCode = 204;
    const id = req.params.id;
    try {
        const vanResult = await pool.query("SELECT Id FROM ApplicationNetwork WHERE Network = $1", [
            id,
        ]);
        if (vanResult.rowCount > 0) {
            throw new Error("Cannot delete a network with active application networks");
        }

        const siteResult = await pool.query("SELECT Id FROM NetworkSite WHERE Network = $1", [id]);
        if (siteResult.rowCount > 0) {
            throw new Error("Cannot delete a network with interior sites");
        }

        const result = await pool.query("DELETE FROM Network WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Network not found: ${id}` });
        }

        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// NETWORK ACCESS POINTS ================================

const listNetworkAccessPoints = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM NetworkAccessPoint");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createNetworkAccessPoint = async function (req, res) {
    let statusCode;
    const { name, networksite, kind, hostname, port, bindhost } = req.body;
    try {
        const siteResult = await pool.query("SELECT Name from NetworkSite WHERE Id = $1", [
            networksite,
        ]);
        if (siteResult.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Referenced network site not found: ${networksite}` });
        }

        // If the access point name is not unique within the network site, modify it to be unique.
        const namesResult = await pool.query(
            "SELECT Name FROM NetworkAccessPoint WHERE NetworkSite = $1",
            [networksite]
        );
        const existingNames = namesResult.rows.map((row) => row.name);
        const uniqueApName = UniquifyName(name, existingNames);

        //
        // Create the access point
        //
        const apResult = await pool.query(
            `INSERT INTO NetworkAccessPoint(Name, Kind, NetworkSite, Hostname, Port, BindHost) ` +
                `VALUES ($1, $2, $3, $4, $5, COALESCE($6, '')) RETURNING Id`,
            [uniqueApName, kind, networksite, hostname, port, bindhost ?? null]
        );

        statusCode = 201;
        res.status(statusCode).json({ id: apResult.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readNetworkAccessPoint = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM NetworkAccessPoint WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Network access point not found: ${id}` });
        }

        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteNetworkAccessPoint = async function (req, res) {
    let statusCode = 204;
    const id = req.params.id;
    try {
        const result = await pool.query("DELETE FROM NetworkAccessPoint WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Network access point not found: ${id}` });
        }

        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// NETWORK LINKS ================================

const listNetworkLinks = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM NetworkLink");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createNetworkLink = async function (req, res) {
    let statusCode;
    const { accesspoint, connectingsite, cost } = req.body;
    try {
        //
        // Get the referenced access point for validation
        //
        const accessResult = await pool.query(
            "SELECT Kind, NetworkAccessPoint.NetworkSite, NetworkSite.Id as siteId, NetworkSite.Network FROM NetworkAccessPoint " +
                "JOIN NetworkSite ON NetworkSite.Id = NetworkAccessPoint.NetworkSite " +
                "WHERE NetworkAccessPoint.Id = $1",
            [accesspoint]
        );

        //
        // Validate that the referenced access point exists
        //
        if (accessResult.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Referenced access point not found: ${accesspoint}` });
        }

        const ap = accessResult.rows[0];

        //
        // Validate that the referenced access point is of kind 'inter-router'
        //
        if (ap.kind != "inter-router") {
            statusCode = 400;
            return res.status(statusCode).json({
                message: `Referenced access point must be 'inter-router', found '${ap.kind}'`,
            });
        }

        //
        // Validate that the referenced site is in the specified network
        //
        const siteResult = await pool.query("SELECT Network FROM NetworkSite WHERE Id = $1", [
            connectingsite,
        ]);
        if (siteResult.rowCount === 0) {
            statusCode = 404;
            return res
                .status(statusCode)
                .json({ message: `Referenced connecting site not found: ${connectingsite}` });
        }

        if (siteResult.rows[0].network != ap.network) {
            statusCode = 400;
            return res.status(statusCode).json({
                message: `Referenced connecting site is not in the same network as the access-point`,
            });
        }

        //
        // Create the new link
        //
        const linkResult = await pool.query(
            "INSERT INTO NetworkLink(AccessPoint, ConnectingSite, Cost) " +
                "VALUES ($1, $2, $3) RETURNING Id",
            [accesspoint, connectingsite, cost ?? 1]
        );

        statusCode = 201;
        res.status(statusCode).json({ id: linkResult.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readNetworkLink = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM NetworkLink WHERE Id = $1", [id]);

        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Network link not found: ${id}` });
        }

        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteNetworkLink = async function (req, res) {
    let statusCode = 204;
    const id = req.params.id;
    try {
        const result = await pool.query("DELETE FROM NetworkLink WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Network link not found: ${id}` });
        }

        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// NETWORK SITES ================================

const listNetworkSites = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM NetworkSite");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createNetworkSite = async function (req, res) {
    let statusCode;
    const { name, edge, network, location, deploymenttarget } = req.body;
    try {
        //
        // If the name is not unique within the backbone, modify it to be unique.
        //
        const namesResult = await pool.query("SELECT Name FROM NetworkSite WHERE Network = $1", [
            network,
        ]);

        const existingNames = namesResult.rows.map((row) => row.name);
        const uniqueName = UniquifyName(name, existingNames);

        //
        // Create the site
        //
        const result = await pool.query(
            `INSERT INTO NetworkSite(Name, Edge, Network, Location, DeploymentTarget) ` +
                `VALUES ($1, $2, $3, $4, $5) RETURNING Id`,
            [uniqueName, edge, network, location, deploymenttarget]
        );

        if (result.rowCount === 0) {
            throw new Error("Failed to create network site");
        }

        statusCode = 201;
        res.status(statusCode).json({ id: result.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readNetworkSite = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM NetworkSite WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Network site not found: ${id}` });
        }

        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteNetworkSite = async function (req, res) {
    let statusCode = 204;
    const id = req.params.id;
    try {
        const result = await pool.query("DELETE FROM NetworkSite WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Network site not found: ${id}` });
        }

        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

// APPLICATION SITES ================================

const listApplicationSites = async function (req, res) {
    let statusCode = 200;
    try {
        const result = await pool.query("SELECT * FROM ApplicationSite");
        res.status(statusCode).json(result.rows);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const createApplicationSite = async function (req, res) {
    let statusCode = 201;
    const { applicationnetworklocation, namespace, hostname } = req.body;
    try {
        const applicationnetworklocationResult = await pool.query(
            "SELECT Id FROM ApplicationNetworkLocation WHERE Id = $1",
            [applicationnetworklocation]
        );
        if (applicationnetworklocationResult.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({
                message: `Referenced application network location not found: ${applicationnetworklocation}`,
            });
        }
        const result = await pool.query(
            "INSERT INTO ApplicationSite(ApplicationNetworkLocation, Namespace, Hostname) VALUES ($1, $2, $3) RETURNING Id",
            [applicationnetworklocation, namespace, hostname]
        );
        res.status(statusCode).json({ id: result.rows[0].id });
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const readApplicationSite = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    try {
        const result = await pool.query("SELECT * FROM ApplicationSite WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Application site not found: ${id}` });
        }
        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const updateApplicationSite = async function (req, res) {
    let statusCode = 200;
    const id = req.params.id;
    const { namespace, hostname } = req.body;
    try {
        const result = await pool.query(
            "UPDATE ApplicationSite SET Namespace = COALESCE($1, Namespace), Hostname = COALESCE($2, Hostname) WHERE Id = $3 RETURNING *",
            [namespace ?? null, hostname ?? null, id]
        );
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Application site not found: ${id}` });
        }
        res.status(statusCode).json(result.rows[0]);
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const deleteApplicationSite = async function (req, res) {
    let statusCode = 204;
    const id = req.params.id;
    try {
        const result = await pool.query("DELETE FROM ApplicationSite WHERE Id = $1", [id]);
        if (result.rowCount === 0) {
            statusCode = 404;
            return res.status(statusCode).json({ message: `Application site not found: ${id}` });
        }
        res.status(statusCode).end();
    } catch (error) {
        statusCode = 500;
        res.status(statusCode).json({ message: error.message });
    }
};

const operations = {
    listApplicationNetworks,
    createApplicationNetwork,
    readApplicationNetwork,
    updateApplicationNetwork,
    deleteApplicationNetwork,
    listApplicationNetworkLocations,
    createApplicationNetworkLocation,
    deleteApplicationNetworkLocation,
    readApplicationNetworkLocation,
    updateApplicationNetworkLocation,
    listDeploymentTargets,
    readDeploymentTarget,
    pushToDeploymentTarget,
    listFootprints,
    readFootprint,
    listLocations,
    createLocation,
    readLocation,
    updateLocation,
    deleteLocation,
    listNetworks,
    createNetwork,
    readNetwork,
    deleteNetwork,
    listNetworkAccessPoints,
    createNetworkAccessPoint,
    readNetworkAccessPoint,
    deleteNetworkAccessPoint,
    listNetworkLinks,
    createNetworkLink,
    readNetworkLink,
    deleteNetworkLink,
    listNetworkSites,
    createNetworkSite,
    readNetworkSite,
    deleteNetworkSite,
    listApplicationSites,
    createApplicationSite,
    readApplicationSite,
    deleteApplicationSite,
    updateApplicationSite,
};

const createApiApp = async function () {
    const app = express();
    const router = express.Router();

    app.set("trust proxy", true);
    app.use(express.json());
    app.use(cors());

    morgan.token("ts", (_req, _res) => {
        return new Date().toISOString();
    });
    app.use(
        morgan(
            ":ts :remote-addr :remote-user :method :url :status :res[content-length] :response-time ms",
            {
                skip: function (req, _res) {
                    return !!req._skip_log;
                },
            }
        )
    );

    // Initialize the API using the OpenAPI spec
    await initialize({
        app,
        apiDoc: yaml.load(fs.readFileSync(openApiSpecPath, "utf8")),
        operations: operations,
        promiseMode: true,
        exposeApiDocs: true,
        docsPath: "/openapi.json",
        errorMiddleware(err, req, res, next) {
            if (res.headersSent) {
                return next(err);
            }
            const status = err.status || 500;
            res.status(status).json({
                message:
                    err.message ||
                    (status === 400 ? "Request validation failed" : "Internal server error"),
                errors: err.errors,
            });
        },
    });

    app.use(
        "/docs",
        swaggerUi.serve,
        swaggerUi.setup(null, {
            swaggerOptions: { url: `${API_PREFIX}/openapi.json` },
        })
    );

    app.use(router);

    app.use((req, res) => {
        res.status(404).json({ message: "invalid path" });
    });

    return app;
};

export async function startApiServer() {
    const app = await createApiApp();
    const server = app.listen(API_PORT, () => {
        let host = server.address().address;
        const port = server.address().port;
        if (host[0] == ":") {
            host = "[" + host + "]";
        }
        Log(`API Server listening on http://${host}:${port}`);
    });
}
