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

var connectionPool;

export async function Start() {
    Log('[Database module starting]');
    connectionPool = new Pool();
}

export function ClientFromPool() {
    return connectionPool.connect();
}

export function QueryConfig () {
    return connectionPool.query('SELECT * FROM configuration WHERE id = 0')
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

export function extractUserInfo(req) {
  // Handle system user case
  if (req && typeof req === 'object' && req.userId && !req.kauth) {
    return {
      userId: req.userId,
      userGroups: req.userGroups || [],
      isAdmin: false
    }
  }
  
  const userCredentials = req?.kauth?.grant?.access_token?.content
  if (userCredentials) {
    return {
      userId: userCredentials.sub,
      userGroups: userCredentials.clientGroups || [],
      isAdmin: isAdmin(userCredentials.clientGroups)
    }
  }
  return { userId: null, userGroups: [], isAdmin: false }
}

export function isAdmin(userGroups) {
  return userGroups?.includes('admin') || false
}

export function convertArrayLiteral(arr) {
  if (!arr || !Array.isArray(arr)) {
    return '{}'
  }
  // Escape single quotes and wrap each element in quotes if needed
  const escaped = arr.map(item => {
    const str = String(item)
    // Escape single quotes by doubling them
    const escapedStr = str.replaceAll('\'', "''")
    // Wrap in double quotes
    return `"${escapedStr}"`
  })
  return `{${escaped.join(',')}}`
}

export async function queryWithContext(req, client, callback) {
  let { userId, userGroups, isAdmin } = extractUserInfo(req)
  userGroups = convertArrayLiteral(userGroups)
  try {
    await client.query("BEGIN")

    let internalUserId
    if (userId == SYSTEM_USER_ID) {
      internalUserId = "00000000-0000-0000-0000-000000000001"
    } else {
      // Get or create internal user ID
      const userIdentityResult = await client.query(
        `INSERT INTO UserIdentities (KeycloakSub, IsAdmin, LastSeen) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (KeycloakSub) 
         DO UPDATE SET LastSeen = CURRENT_TIMESTAMP
         RETURNING Id`,
         [userId, isAdmin]
      );
      internalUserId = userIdentityResult.rows[0].id;
    }


    await client.query('SELECT set_config(\'app.user_id\', $1, true)', [internalUserId])
    await client.query('SELECT set_config(\'app.user_groups\', $1, true)', [userGroups])
    await client.query('SELECT set_config(\'app.is_admin\', $1, true)', [isAdmin])
    const result = await callback(client, { userId: internalUserId, userGroups: userGroups, isAdmin: isAdmin })
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

export const SYSTEM_USER_ID = "system:management-controller";

