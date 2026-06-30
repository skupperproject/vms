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

const mockConfig = {
    rootissuer: 'test-root-issuer',
    defaultcaexpiration: { days: 365 },
    defaultcertexpiration: { days: 90 },
    certorganization: 'Skupper Test Org',
    backbonecaexpiration: { years: 1 },
    sitecontrollerimage: 'quay.io/skupper/vms-site-controller:test',
};

vi.mock('./db.js', () => ({
    QueryConfig: vi.fn(async () => mockConfig),
}));

import {
    Start,
    RootIssuer,
    DefaultCaExpiration,
    DefaultCertExpiration,
    CertOrganization,
    BackboneExpiration,
    SiteControllerImage,
} from './config.js';

describe('config getters', () => {
    beforeEach(async () => {
        await Start();
    });

    it('RootIssuer returns configured value', () => {
        expect(RootIssuer()).toBe('test-root-issuer');
    });

    it('DefaultCaExpiration returns configured value', () => {
        expect(DefaultCaExpiration()).toEqual({ days: 365 });
    });

    it('DefaultCertExpiration returns configured value', () => {
        expect(DefaultCertExpiration()).toEqual({ days: 90 });
    });

    it('CertOrganization returns configured value', () => {
        expect(CertOrganization()).toBe('Skupper Test Org');
    });

    it('BackboneExpiration returns configured value', () => {
        expect(BackboneExpiration()).toEqual({ years: 1 });
    });

    it('SiteControllerImage returns configured value', () => {
        expect(SiteControllerImage()).toBe('quay.io/skupper/vms-site-controller:test');
    });
});
