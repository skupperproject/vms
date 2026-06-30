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

/**
 * Minimal auth double for API tests. Set `x-test-auth: 1` to authenticate;
 * optional `x-test-roles` comma-separated realm roles.
 */
export function createMockAuth(defaultUser = {}) {
    const middleware = (req, res, next) => {
        if (req.headers['x-test-auth']) {
            const roleHeader = req.headers['x-test-roles'];
            const roles = roleHeader
                ? roleHeader.split(',').map((r) => r.trim()).filter(Boolean)
                : (defaultUser.roles || ['admin']);
            req.kauth = {
                grant: {
                    access_token: {
                        content: {
                            sub: defaultUser.sub || 'test-user-sub',
                            given_name: defaultUser.given_name || 'Test',
                            family_name: defaultUser.family_name || 'User',
                            clientGroups: defaultUser.groups || ['group-a'],
                            realm_access: { roles },
                        },
                    },
                },
            };
        }
        next();
    };

    const protect = (requiredRealmRole) => {
        return (req, res, next) => {
            if (!req.kauth?.grant?.access_token?.content) {
                return res.status(401).send('Unauthorized');
            }
            if (requiredRealmRole) {
                const roleName = requiredRealmRole.replace(/^realm:/, '');
                const roles = req.kauth.grant.access_token.content.realm_access?.roles || [];
                if (!roles.includes(roleName)) {
                    return res.status(403).send('Forbidden');
                }
            }
            return next();
        };
    }

    return {
        middleware,
        protect,
        registerOidcRoutes: () => {},
    };
}
