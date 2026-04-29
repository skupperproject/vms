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

import { Log } from '@skupperx/modules/log'
import { Pool } from 'pg';

let userPool;
let systemPool;

export async function Start() {
    Log('[Database module starting]');
    // Create separate connection pools for different roles
    userPool = new Pool({ user: 'app_user', password: process.env.APP_USER_PASSWORD });
    systemPool = new Pool({ user: 'app_system', password: process.env.APP_SYSTEM_PASSWORD });
}

// Get client from appropriate pool based on context string
export function ClientFromPool(context = 'user') {
    if (context === 'system') {
        return systemPool.connect();
    }
    // Default to user pool (includes admin users - they use user pool but admin role bypasses RLS)
    return userPool.connect();
}

export function QueryConfig () {
    // QueryConfig uses system pool as it's a system-level operation
    return systemPool.query('SELECT * FROM configuration WHERE id = 0')
    .then(result => result.rows[0]);
}

export function IntervalMilliseconds (value) {
    try {
        var result = 0;
        for (const [unit, quantity] of Object.entries(value)) {
            if        (unit == 'years' || unit == 'year') {
                result += quantity * (3600 * 24 * 365 * 1000);
            } else if (unit == 'weeks' || unit == 'week') {
                result += quantity * (3600 * 24 * 7 * 1000);
            } else if (unit == 'days' || unit == 'day') {
                result += quantity * (3600 * 24 * 1000);
            } else if (unit == 'hours' || unit == 'hour') {
                result += quantity * (3600 * 1000);
            } else if (unit == 'minutes' || unit == 'minute') {
                result += quantity * (60 * 1000);
            } else if (unit == 'seconds' || unit == 'second') {
                result += quantity * (1000);
            }
        }

        //
        // Minimum allowed interval is one hour
        //
        if (result < 3600000) {
            result = 3600000;
        }

        return result;
    } catch (err) {
        Log(`IntervalMilliseconds error: ${err.stack}`);
        return 0;
    }
}

// pull user info out of verified OIDC access token (req.kauth set by management-oidc middleware)
export function extractUserInfo(req) {
    const userCredentials = req?.kauth?.grant?.access_token?.content
    if (userCredentials) {
        const admin = isAdmin(userCredentials.realm_access?.roles)
        return {
            context: admin ? 'admin' : 'user',
            userId: userCredentials.sub,
            userGroups: userCredentials.clientGroups || [],
            isAdmin: admin
        }
    }
    return { context: 'user', userId: null, userGroups: [], isAdmin: false }
}

export function isAdmin(userRoles) {
    return userRoles?.includes('admin') || false
}

export async function queryWithContext(req, client, callback) {
    const { context, userId, userGroups, isAdmin } = extractUserInfo(req)
    try {
        await client.query("BEGIN")

        let internalUserId = null
        
        if ((context === 'user' || context === 'admin') && userId) {
            // Get or create internal user ID for regular users
            const userResult = await client.query(
                `INSERT INTO Users (KeycloakSub, IsAdmin, LastSeen) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (KeycloakSub) 
                DO UPDATE SET LastSeen = CURRENT_TIMESTAMP, IsAdmin = $2
                RETURNING Id`,
                [userId, isAdmin]
            );
            internalUserId = userResult.rows[0].id;
            
            // Set RLS session variables for users
            await client.query('SELECT set_config(\'session.user_id\', $1, true)', [internalUserId])
            await client.query('SELECT set_config(\'session.user_groups\', $1, true)', [userGroups])
            await client.query('SELECT set_config(\'session.is_admin\', $1, true)', [String(isAdmin)])
        } 
        
        const result = await callback(client, { 
            userId: internalUserId,
            userGroups: userGroups
        })
        await client.query("COMMIT")
        return result
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    }
}
