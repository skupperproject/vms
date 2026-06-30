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

import { describe, it, expect } from 'vitest';
import { HashOfData, HashOfSecret, HashOfConfigMap } from './hash.js';

describe('hash', () => {
    it('HashOfData is stable regardless of key order', () => {
        const a = HashOfData({ z: '2', a: '1' });
        const b = HashOfData({ a: '1', z: '2' });
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{40}$/);
    });

    it('HashOfSecret hashes secret data', () => {
        const secret = { data: { 'tls.crt': 'abc', 'tls.key': 'def' } };
        expect(HashOfSecret(secret)).toBe(HashOfData(secret.data));
    });

    it('HashOfConfigMap hashes configmap data', () => {
        const cm = { data: { outgoing: '{}' } };
        expect(HashOfConfigMap(cm)).toBe(HashOfData(cm.data));
    });
});
