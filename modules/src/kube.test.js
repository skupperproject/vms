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
import { Annotation, Controlled, Namespace } from './kube.js';
import { META_ANNOTATION_SKUPPERX_CONTROLLED, META_ANNOTATION_STATE_ID } from './common.js';

describe('kube helpers', () => {
    it('Annotation reads metadata annotations', () => {
        const obj = {
            metadata: {
                annotations: {
                    [META_ANNOTATION_STATE_ID]: 'ap-1',
                },
            },
        };

        expect(Annotation(obj, META_ANNOTATION_STATE_ID)).toBe('ap-1');
        expect(Annotation({}, META_ANNOTATION_STATE_ID)).toBeUndefined();
        expect(Annotation(null, META_ANNOTATION_STATE_ID)).toBeUndefined();
    });

    it('Controlled detects skupperx-controlled resources', () => {
        expect(Controlled({
            metadata: {
                annotations: {
                    [META_ANNOTATION_SKUPPERX_CONTROLLED]: 'true',
                },
            },
        })).toBe(true);

        expect(Controlled({
            metadata: {
                annotations: {
                    [META_ANNOTATION_SKUPPERX_CONTROLLED]: 'false',
                },
            },
        })).toBe(false);
    });

    it('Namespace defaults to default before Start', () => {
        expect(Namespace()).toBe('default');
    });
});
