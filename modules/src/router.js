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

import { OpenSender, Request } from "./amqp.js";

const QUERY_TIMEOUT_SECONDS = 5;

function convertBodyToItems(body) {
    let keys = body.attributeNames;
    let items = [];
    body.results.forEach((values) => {
        let item = {};
        for (let i = 0; i < keys.length; i++) {
            item[keys[i]] = values[i];
        }
        items.push(item);
    });
    return items;
}

export class RouterManagement {
    constructor(conn) {
        this.conn       = conn;
        this.mgmtSender = undefined;
        this.ready      = false;
    }

    async start() {
        this.mgmtSender = await OpenSender("Management", this.conn, "$management");
        this.ready      = true;
    }

    async _listManagementEntity(entityType, timeout, attributes = []) {
        if (this.ready) {
            let requestAp = {
                operation  : "QUERY",
                type       : "org.amqp.management",
                entityType : entityType,
                name       : "self",
            };
            let requestBody = {
                attributeNames : attributes,
            };

            const [replyAp, replyBody] = await Request(this.mgmtSender, requestBody, requestAp, null, timeout);
            if (replyAp.statusCode == 200) {
                return convertBodyToItems(replyBody);
            }

            throw new Error(replyAp.statusDescription);
        } else {
            return [];
        }
    }

    async _createManagementEntity(entityType, name, data, timeout) {
        let requestAp = {
            operation : "CREATE",
            type      : entityType,
            name      : name,
        };

        const [replyAp, replyBody] = await Request(this.mgmtSender, data, requestAp, null, timeout);
        if (replyAp.statusCode == 201) {
            return replyBody;
        }

        throw new Error(replyAp.statusDescription);
    }

    async _deleteManagementEntity(entityType, name, timeout) {
        let requestAp = {
            operation : "DELETE",
            type      : entityType,
            name      : name,
        };

        const [replyAp, replyBody] = await Request(this.mgmtSender, undefined, requestAp, null, timeout);
        if (replyAp.statusCode == 204) {
            return replyBody;
        }

        throw new Error(replyAp.statusDescription);
    }

    async listSslProfiles(attributes = []) {
        return await this._listManagementEntity("io.skupper.router.sslProfile", QUERY_TIMEOUT_SECONDS, attributes);
    }

    async createSslProfile(name, obj) {
        await this._createManagementEntity("io.skupper.router.sslProfile", name, obj, QUERY_TIMEOUT_SECONDS);
    }

    async deleteSslProfile(name) {
        await this._deleteManagementEntity("io.skupper.router.sslProfile", name, QUERY_TIMEOUT_SECONDS);
    }

    async listConnectors(attributes = []) {
        return await this._listManagementEntity("io.skupper.router.connector", QUERY_TIMEOUT_SECONDS, attributes);
    }

    async createConnector(name, obj) {
        await this._createManagementEntity("io.skupper.router.connector", name, obj, QUERY_TIMEOUT_SECONDS);
    }

    async deleteConnector(name) {
        await this._deleteManagementEntity("io.skupper.router.connector", name, QUERY_TIMEOUT_SECONDS);
    }

    async listListeners(attributes = []) {
        return await this._listManagementEntity("io.skupper.router.listener", QUERY_TIMEOUT_SECONDS, attributes);
    }

    async createListener(name, obj) {
        await this._createManagementEntity("io.skupper.router.listener", name, obj, QUERY_TIMEOUT_SECONDS);
    }

    async deleteListener(name) {
        await this._deleteManagementEntity("io.skupper.router.listener", name, QUERY_TIMEOUT_SECONDS);
    }

    async listAutoLinks(attributes = []) {
        return await this._listManagementEntity("io.skupper.router.router.config.autoLink", QUERY_TIMEOUT_SECONDS, attributes);
    }

    async createAutoLink(name, obj) {
        await this._createManagementEntity("io.skupper.router.router.config.autoLink", name, obj, QUERY_TIMEOUT_SECONDS);
    }

    async deleteAutoLink(name) {
        await this._deleteManagementEntity("io.skupper.router.router.config.autoLink", name, QUERY_TIMEOUT_SECONDS);
    }

    async listAddresses(attributes = []) {
        return await this._listManagementEntity("io.skupper.router.router.address", QUERY_TIMEOUT_SECONDS, attributes);
    }
}
