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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    META_ANNOTATION_STATE_ID,
} from '@skupperx/modules/common';

let accessHandler;

vi.mock('@skupperx/modules/kube', () => ({
    Controlled: (obj) => obj?.metadata?.annotations?.['skupper.io/skupperx-controlled'] === 'true',
    Annotation: (obj, key) => obj?.metadata?.annotations?.[key],
    startWatchRouterAccesses: vi.fn((handler) => {
        accessHandler = handler;
    }),
    WatchNetworkAccesses: vi.fn(),
}));

vi.mock('./sync-site-kube.js', () => ({
    UpdateLocalState: vi.fn(),
}));

import { GetRouterAccessRole } from './ingress-v2.js';

describe('GetRouterAccessRole', () => {
    it('maps access point kinds to router roles', () => {
        expect(GetRouterAccessRole('manage')).toBe('normal');
        expect(GetRouterAccessRole('claim')).toBe('normal');
        expect(GetRouterAccessRole('peer')).toBe('inter-router');
        expect(GetRouterAccessRole('member')).toBe('edge');
    });

    it('throws for unknown kinds', () => {
        expect(() => GetRouterAccessRole('unknown')).toThrow('Unknown kind: unknown');
    });
});

describe('ingress bundles', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('returns empty bundles before any access points are tracked', async () => {
        const {
            GetAccessPointKind,
            GetIngressBundle,
            GetIngressBundleV2,
            GetInitialState,
        } = await import('./ingress-v2.js');

        expect(GetAccessPointKind('missing-ap')).toBeNull();
        expect(GetIngressBundle()).toEqual({});
        expect(GetIngressBundleV2()).toEqual({});
        await expect(GetInitialState()).resolves.toEqual({});
    });
});

describe('access point watcher', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        accessHandler = undefined;
        const ingress = await import('./ingress-v2.js');
        await ingress.Start();
    });

    it('records router access endpoints and syncs local state', async () => {
        const { GetAccessPointKind, GetIngressBundleV2 } = await import('./ingress-v2.js');
        const { UpdateLocalState } = await import('./sync-site-kube.js');

        await accessHandler('ADDED', {
            kind: 'RouterAccess',
            metadata: {
                name: 'peer-router-access',
                annotations: {
                    'skupper.io/skupperx-controlled': 'true',
                    [META_ANNOTATION_STATE_ID]: 'ap-1',
                },
            },
            status: {
                endpoints: [{
                    group: 'skupper-router',
                    host: 'router.example.com',
                    port: 9090,
                }],
            },
        });

        expect(GetAccessPointKind('ap-1')).toBe('peer');
        expect(GetIngressBundleV2()).toEqual({
            'ap-1': {
                host: 'router.example.com',
                port: 9090,
            },
        });
        expect(UpdateLocalState).toHaveBeenCalledWith(
            'accessstatus-ap-1',
            expect.any(String),
            { host: 'router.example.com', port: 9090 },
        );
    });

    it('removes access points on delete', async () => {
        const { GetIngressBundleV2 } = await import('./ingress-v2.js');
        const { UpdateLocalState } = await import('./sync-site-kube.js');

        const access = {
            kind: 'RouterAccess',
            metadata: {
                name: 'peer-router-access',
                annotations: {
                    'skupper.io/skupperx-controlled': 'true',
                    [META_ANNOTATION_STATE_ID]: 'ap-2',
                },
            },
            status: {
                endpoints: [{
                    group: 'skupper-router',
                    host: 'router.example.com',
                    port: 9091,
                }],
            },
        };

        await accessHandler('ADDED', access);
        await accessHandler('DELETED', access);

        expect(GetIngressBundleV2()).toEqual({});
        expect(UpdateLocalState).toHaveBeenLastCalledWith('accessstatus-ap-2', null, {});
    });
});
