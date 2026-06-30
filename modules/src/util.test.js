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
import {
    IsValidUuid,
    ValidateAndNormalizeFields,
    UniquifyName,
    ToYaml,
} from './util.js';

describe('IsValidUuid', () => {
    it('accepts lowercase uuid', () => {
        expect(IsValidUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    });

    it('rejects invalid strings', () => {
        expect(IsValidUuid('not-a-uuid')).toBe(false);
        expect(IsValidUuid('')).toBe(false);
    });
});

describe('ValidateAndNormalizeFields', () => {
    const table = {
        name: { type: 'dnsname', optional: false },
        kind: { type: 'accesskind', optional: false },
        enabled: { type: 'bool', optional: true, default: false },
    };

    it('normalizes valid fields', () => {
        const result = ValidateAndNormalizeFields(
            { name: 'my-site', kind: 'member', enabled: 'true' },
            table,
        );
        expect(result).toEqual({ name: 'my-site', kind: 'member', enabled: true });
    });

    it('rejects unknown keys', () => {
        expect(() => ValidateAndNormalizeFields({ unknown: 'x' }, table)).toThrow(
            /Unknown field key/,
        );
    });

    it('rejects invalid access kind', () => {
        expect(() =>
            ValidateAndNormalizeFields({ name: 'site', kind: 'invalid' }, table),
        ).toThrow(/Expected \[claim, peer, member, manage, van\]/);
    });
});

describe('UniquifyName', () => {
    it('returns original name when unique', () => {
        expect(UniquifyName('alpha', ['beta'])).toBe('alpha');
    });

    it('appends ordinal when name exists', () => {
        expect(UniquifyName('alpha', ['alpha'])).toBe('alpha.2');
        expect(UniquifyName('alpha', ['alpha', 'alpha.2'])).toBe('alpha.3');
    });
});

describe('ToYaml', () => {
    it('dumps a single object', () => {
        const yaml = ToYaml({ kind: 'Site', name: 'test' });
        expect(yaml).toContain('kind: Site');
    });

    it('joins array entries with document separator', () => {
        const yaml = ToYaml([{ a: 1 }, { b: 2 }]);
        expect(yaml).toContain('---');
    });
});
