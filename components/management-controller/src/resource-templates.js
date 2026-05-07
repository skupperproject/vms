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

import {
    META_ANNOTATION_SKUPPERX_CONTROLLED,
    META_ANNOTATION_TLS_INJECT,
    META_ANNOTATION_STATE_TYPE,
    META_ANNOTATION_STATE_ID,
    META_ANNOTATION_STATE_DIR,
    META_ANNOTATION_STATE_KEY,
    META_ANNOTATION_STATE_HASH,
    STATE_TYPE_LINK,
    STATE_TYPE_ACCESS_POINT,
} from '@skupperx/modules/common'
import { createHash } from 'node:crypto';
import { SiteControllerImage } from './config.js';

const CRD_API_VERSION   = "skupper.io/v2alpha1";
const SA_NAME           = 'skupperx-site';
const ROLE_NAME         = SA_NAME;
const ROLE_BINDING_NAME = SA_NAME;
const APPLICATION       = 'skupperx';
const ROUTER_LABEL      = 'skx-router';
const CM_NAME           = 'skupper-internal';
const DEPLOYMENT_NAME   = 'skupperx-site';


export function HashOfData(data) {
    let text = '';
    let keys = Object.keys(data);
    keys.sort();
    for (const key of keys) {
        text += key + data[key];
    }
    return createHash('sha1').update(text).digest('hex');
}

export function HashOfSecret(secret) {
    return HashOfData(secret.data);
}

export function HashOfConfigMap(cm) {
    return HashOfData(cm.data);
}

export function HashOfObjectNoChildren(obj) {
    let data = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value != 'object') {
            data[key] = value;
        }
    }

    return HashOfData(data);
}

export function HashOfSpec(obj) {
    return HashOfData(obj.spec);
}

export function BackboneSite(name, siteId) {
    return {
        apiVersion : CRD_API_VERSION,
        kind       : 'Site',
        metadata : {
            name : name,
        },
        spec : {
            linkAccess : 'none',
            settings   : {
                'management-plane'   : 'skupperx',
                'skupperx-site-id'   : siteId,
                'skupperx-site-type' : 'backbone',
            }
        },
    };
}

export function RouterAccess(accessPoint, tlsName) {
    let role = 'normal';
    switch (accessPoint.kind) {
        case 'peer' :
            role = 'inter-router';
            break;
        case 'member' :
            role = 'edge';
            break;
    }

    let routerAccess = {
        apiVersion : CRD_API_VERSION,
        kind       : 'RouterAccess',
        metadata : {
            name : `access-${accessPoint.kind}-${accessPoint.id}`,
            [META_ANNOTATION_SKUPPERX_CONTROLLED] : true,
        },
        spec : {
            roles : [
                {
                    role : role,
                },
            ],
            tlsCredentials : tlsName,
        },
    };

    if (accessPoint.bindhost) {
        routerAccess.spec.bindHost = accessPoint.bindhost;
    }

    return routerAccess;
}

export function NetworkCR(networkId) {
    return {
        apiVersion : CRD_API_VERSION,
        kind       : 'Network',
        metadata   : {
            name: 'network',
        },
        spec : {
            networkId : networkId,
        }
    };
}

export function NetworkLinkCR(host, port, secret) {
    return {
        apiVersion : CRD_API_VERSION,
        kind       : 'NetworkLink',
        metadata   : {
            name : 'management-link',
        },
        spec : {
            hostname       : host,
            port           : port,
            tlsCredentials : secret,
        },
    };
}

export function LinkCR(linkId, data, secret) {
    let link = {
        apiVersion : 'skupper.io/v2alpha1',
        kind       : 'Link',
        metadata   : {
            name : `skx-link-${linkId}`,
            annotations : {
                [META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
                [META_ANNOTATION_STATE_TYPE]          : STATE_TYPE_LINK,
                [META_ANNOTATION_STATE_ID]            : linkId,
                [META_ANNOTATION_STATE_DIR]           : 'remote',
                [META_ANNOTATION_STATE_KEY]           : `link-${linkId}`,
            },
        },
        spec : {
          cost : parseInt(data.cost, 10),
          endpoints : [{
            group : "skupper-router",
            name  : "inter-router",
            host  : data.host,
            port  : data.port
          }],
          tlsCredentials : secret,
        },
    };

    link.metadata.annotations[META_ANNOTATION_STATE_HASH] = HashOfSpec(link);
    return link;
}

export function LinkConfigMap(linkId, data) {  // DEPRECATE
    let link = {
        apiVersion : 'v1',
        kind       : 'ConfigMap',
        metadata   : {
            name : `skx-link-${linkId}`,
            annotations : {
                [META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
                [META_ANNOTATION_STATE_TYPE]          : STATE_TYPE_LINK,
                [META_ANNOTATION_STATE_ID]            : linkId,
                [META_ANNOTATION_STATE_DIR]           : 'remote',
                [META_ANNOTATION_STATE_KEY]           : `link-${linkId}`,
            },
        },
        data : data,
    };

    link.metadata.annotations[META_ANNOTATION_STATE_HASH] = HashOfConfigMap(link);
    return link;
}

export function AccessPointConfigMap(apId, data) {  // DEPRECATE
    let accessPoint = {
        apiVersion : 'v1',
        kind       : 'ConfigMap',
        metadata   : {
            name : `skx-access-${apId}`,
            annotations : {
                [META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
                [META_ANNOTATION_STATE_TYPE]          : STATE_TYPE_ACCESS_POINT,
                [META_ANNOTATION_STATE_ID]            : apId,
                [META_ANNOTATION_STATE_DIR]           : 'remote',
                [META_ANNOTATION_STATE_KEY]           : `access-${apId}`,
            },
        },
        data : data,
    };

    accessPoint.metadata.annotations[META_ANNOTATION_STATE_HASH] = HashOfConfigMap(accessPoint);
    return accessPoint;
}

export function Secret(certificate, profile_name, inject, stateKey) {
    let secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        type: 'kubernetes.io/tls',
        metadata: {
            name: profile_name,
            annotations: {
                [META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
            },
        },
        data: certificate.data,
    };

    if (inject) {
        secret.metadata.annotations[META_ANNOTATION_TLS_INJECT] = inject;
    }
    if (stateKey) {
        secret.metadata.annotations[META_ANNOTATION_STATE_DIR] = 'remote';
        secret.metadata.annotations[META_ANNOTATION_STATE_KEY] = stateKey;
        secret.metadata.annotations[META_ANNOTATION_STATE_HASH] = HashOfSecret(secret);
    }

    return secret;
}

export function BackboneRole() {
    return {
        apiVersion : 'rbac.authorization.k8s.io/v1',
        kind       : 'Role',
        metadata   : {
            name   : 'skupperx-site',
            labels : {
                application : 'skupperx',
            },
        },
        rules : [
            {
                apiGroups : [""],
                resources : ["secrets", "configmaps", "pods"],
                verbs     : ["get", "list", "watch", "create", "update", "delete", "patch"],
            },
            {
                apiGroups : ["apps"],
                resources : ["deployments"],
                verbs     : ["get", "list", "watch", "create", "update", "delete", "patch"],
            },
            {
                apiGroups : ["skupper.io"],
                resources : ["sites", "links", "networkaccesses", "routeraccesses"],
                verbs     : ["get", "list", "watch", "create", "update", "delete", "patch"],
            },
        ],
    };
}

export function ServiceAccount() {
    return {
        apiVersion : 'v1',
        kind       : 'ServiceAccount',
        metadata   : {
            name   : SA_NAME,
            labels : {
                application : APPLICATION,
            },
        },
    };
}

export function RoleBinding() {
    return {
        apiVersion : 'rbac.authorization.k8s.io/v1',
        kind       : 'RoleBinding',
        metadata   : {
            name   : ROLE_BINDING_NAME,
            labels : {
                application : APPLICATION,
            },
        },
        subjects : [
            {
                kind : 'ServiceAccount',
                name : SA_NAME,
            },
        ],
        roleRef : {
            apiGroup : 'rbac.authorization.k8s.io',
            kind     : 'Role',
            name     : ROLE_NAME,
        },
    };
}

export function Deployment(bsid, backboneMode, target) {
    const deployment = {
        apiVersion : 'apps/v1',
        kind       : 'Deployment',
        metadata : {
            labels : {
                'app.kubernetes.io/name'    : DEPLOYMENT_NAME,
                'app.kubernetes.io/part-of' : 'skupperx',
                'skupper.io/component'      : 'router',
                application                 : APPLICATION,
            },
            name : DEPLOYMENT_NAME,
        },
        spec : {
            progressDeadlineSeconds : 600,
            replicas                : 1,
            revisionHistoryLimit    : 10,
            selector : {
                matchLabels : {
                    'skupper.io/component': 'router',
                },
            },
            strategy : {
                rollingUpdate : {
                    maxSurge       : '25%',
                    maxUnavailable : '25%',
                },
                type : 'RollingUpdate',
            },
            template : {
                metadata : {
                    labels : {
                        'app.kubernetes.io/name'    : DEPLOYMENT_NAME,
                        'app.kubernetes.io/part-of' : 'skupperx',
                        application                 : ROUTER_LABEL,
                        'skupper.io/component'      : 'router',
                    },
                },
                spec : {
                    containers : [
                        {
                            image           : SiteControllerImage(),
                            imagePullPolicy : 'Always',
                            name            : 'controller',
                            env : [
                                { name: 'SKUPPERX_SITE_ID', value: bsid },
                                { name: 'SKX_BACKBONE',     value: backboneMode ? 'YES' : 'NO' },
                                { name: 'SKX_PLATFORM',     value: target},
                                { name: 'NODE_ENV',         value: 'production'},
                                { name: 'SIDECAR_MODE',     value: 'NO'},
                            ],
                            ports : [
                                {
                                    containerPort : 1040,
                                    name          : 'siteapi',
                                    protocol      : 'TCP',
                                },
                            ],
                            readinessProbe : {
                                failureThreshold : 3,
                                httpGet : {
                                    path   : '/healthz',
                                    port   : 1040,
                                    scheme : 'HTTP',
                                },
                                initialDelaySeconds : 1,
                                periodSeconds       : 10,
                                successThreshold    : 1,
                                timeoutSeconds      : 1,
                            },
                            resources : {},
                            securityContext : {
                                runAsNonRoot : true,
                            },
                            terminationMessagePath   : '/dev/termination-log',
                            terminationMessagePolicy : 'File',
                        },
                    ],
                    dnsPolicy       : 'ClusterFirst',
                    restartPolicy   : 'Always',
                    schedulerName   : 'default-scheduler',
                    securityContext : {
                        runAsNonRoot : true,
                    },
                    serviceAccount                : SA_NAME,
                    serviceAccountName            : SA_NAME,
                    terminationGracePeriodSeconds : 30,
                },
            },
        },
    };

    return deployment;
}
