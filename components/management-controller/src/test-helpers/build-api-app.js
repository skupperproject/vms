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

import express from 'express';
import bodyParser from 'body-parser';
import { createMockAuth } from './mock-auth.js';

const DEFAULT_ROLES = [
    'admin',
    'backbone-owner',
    'can-list-backbones',
    'can-list-accesspoints-backbone',
    'van-owner',
    'can-list-vans',
    'certificate-manager',
];

/**
 * Build an Express app with mocked OIDC auth and selected API routers mounted.
 */
export async function buildApiApp({
    roles = DEFAULT_ROLES,
    includeAdmin = true,
    includeUser = true,
    includeMcRoutes = false,
} = {}) {
    const app = express();
    const router = express.Router();
    const auth = createMockAuth({ roles });

    router.use(auth.middleware);
    router.use(bodyParser.text({ type: ['application/yaml'] }));

    if (includeAdmin) {
        const adminApi = await import('../api-admin.js');
        await adminApi.Initialize(router, auth);
    }
    if (includeUser) {
        const userApi = await import('../api-user.js');
        await userApi.Initialize(router, auth);
    }
    if (includeMcRoutes) {
        const mcApi = await import('../mc-apiserver.js');
        await mcApi.Initialize(router, auth);
    }

    app.use(router);
    return { app, auth };
}
