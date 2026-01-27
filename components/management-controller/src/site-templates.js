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

import { SiteDataplaneImage, SiteControllerImage } from './config.js';
import { dump } from 'js-yaml';
import {
  META_ANNOTATION_SKUPPERX_CONTROLLED,
  META_ANNOTATION_TLS_INJECT,
  META_ANNOTATION_STATE_DIR,
  META_ANNOTATION_STATE_KEY,
  META_ANNOTATION_STATE_HASH,
  META_ANNOTATION_STATE_TYPE,
  STATE_TYPE_LINK,
  META_ANNOTATION_STATE_ID,
  STATE_TYPE_ACCESS_POINT
} from '@skupperx/modules/common'
import { createHash } from 'node:crypto';
import { Expand } from './gotemplate.js';

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

export function ServiceAccountYaml() {
    return `---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${SA_NAME}
  labels:
    application: ${APPLICATION}
`;
}

export function BackboneRoleYaml() {
    return `---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${ROLE_NAME}
  labels:
    application: ${APPLICATION}
rules:
- apiGroups: [""]
  resources: ["configmaps", "pods", "pods/exec", "services", "secrets", "serviceaccounts", "events"]
  verbs: ["get", "list", "watch", "create", "update", "delete", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list", "watch", "create", "update", "delete"]
- apiGroups: ["route.openshift.io"]
  resources: ["routes"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses", "networkpolicies"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["projectcontour.io"]
  resources: ["httpproxies"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["rolebindings", "roles"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["apps.openshift.io"]
  resources: ["deploymentconfigs"]
  verbs: ["get", "list", "watch"]
`;
}

export function MemberRoleYaml() {
  return `---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${ROLE_NAME}
  labels:
    application: ${APPLICATION}
rules:
- apiGroups: [""]
  resources: ["configmaps", "pods", "pods/exec", "services", "secrets", "serviceaccounts", "events"]
  verbs: ["get", "list", "watch", "create", "update", "delete", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list", "watch", "create", "update", "delete"]
`;
}

export function RoleBindingYaml() {
    return `---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    application: ${APPLICATION}
  name: ${ROLE_BINDING_NAME}
subjects:
- kind: ServiceAccount
  name: ${SA_NAME}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${ROLE_NAME}
`;
}

export function ConfigMapYaml(mode, sitename, vanId = null, networkId = null) {
    return `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${CM_NAME}
data:
  skrouterd.json: |-
    [
        [
            "router",
            {
                "id": "${sitename ? sitename : 'skx-${HOSTNAME}'}",
                "mode": "${mode}",
                "helloMaxAgeSeconds": "3",
                "metadata": "{\\"version\\":\\"1.4.3\\",\\"platform\\":\\"kubernetes\\"}"
            }
        ],
        [
            "network",
            {
${networkId ? `                "networkId":"${networkId}"${vanId ? ',' : ''}` : ''}
${vanId ? `                "tenantId":"${vanId}"` : ''}
            }
        ],
        [
            "listener",
            {
                "name": "health",
                "role": "normal",
                "port": 9090,
                "http": true,
                "httpRootDir": "disabled",
                "healthz": true,
                "metrics": true
            }
        ],
        [
            "listener",
            {
                "name": "sidecar",
                "host": "localhost",
                "port": 5672
            }
        ],
        [
            "address",
            {
                "prefix": "mc",
                "distribution": "multicast"
            }
        ],
        [
            "log",
            {
                "module": "ROUTER_CORE",
                "enable": "error+"
            }
        ]
    ]
`;
}

export function DeploymentYaml(bsid, backboneMode, target) {
    let values = {
        deploymentName     : DEPLOYMENT_NAME,
        application        : APPLICATION,
        routerLabel        : ROUTER_LABEL,
        serviceAccountName : SA_NAME,
        dataplaneImage     : SiteDataplaneImage(),
        controllerImage    : SiteControllerImage(),
        backboneMode       : backboneMode ? 'YES' : 'NO',
        siteId             : bsid,
        targetV2           : target == 'sk2',
        targetKube         : target == 'kube' || target == 'm-server',
        platform           : target,
    };
    const template =
`---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app.kubernetes.io/name: {{.deploymentName}}
    app.kubernetes.io/part-of: skupperx
    skupper.io/component: router
    application: {{.application}}
  name: {{.deploymentName}}
spec:
  progressDeadlineSeconds: 600
  replicas: 1
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      skupper.io/component: router
  strategy:
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
    type: RollingUpdate
  template:
    metadata:
{{- if .targetKube }}
      annotations:
        prometheus.io/port: "9090"
        prometheus.io/scrape: "true"
{{- end }}
      labels:
        app.kubernetes.io/name: {{.deploymentName}}
        app.kubernetes.io/part-of: skupperx
        application: {{.routerLabel}}
        skupper.io/component: router
    spec:
      containers:
{{- if .targetKube }}
      - env:
        - name: APPLICATION_NAME
          value: {{.application}}
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.namespace
        - name: POD_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.podIP
        - name: QDROUTERD_AUTO_MESH_DISCOVERY
          value: QUERY
        - name: QDROUTERD_CONF
          value: /etc/skupper-router/config/skrouterd.json
        - name: QDROUTERD_CONF_TYPE
          value: json
        image: {{.dataplaneImage}}
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: 9090
            scheme: HTTP
          initialDelaySeconds: 60
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        name: router
        ports:
        - containerPort: 9090
          name: http
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: 9090
            scheme: HTTP
          initialDelaySeconds: 1
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        securityContext:
          runAsNonRoot: true
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/skupper-router/config/
          name: router-config
        - mountPath: /etc/skupper-router-certs
          name: skupper-router-certs
{{- end }}
      - image: {{.controllerImage}}
        imagePullPolicy: Always
        name: controller
        env:
        - name: SKUPPERX_SITE_ID
          value: {{.siteId}}
        - name: SKX_BACKBONE
          value: "{{.backboneMode}}"
        - name: SKX_PLATFORM
          value: "{{.platform}}"
        - name: NODE_ENV
          value: production
        - name: SIDECAR_MODE
{{- if .targetKube }}
          value: "YES"
{{- else }}
          value: "NO"
{{- end }}
        ports:
        - containerPort: 1040
          name: siteapi
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: 1040
            scheme: HTTP
          initialDelaySeconds: 1
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        securityContext:
          runAsNonRoot: true
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/skupper-router-certs
          name: skupper-router-certs
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        runAsNonRoot: true
      serviceAccount: {{.serviceAccountName}}
      serviceAccountName: {{.serviceAccountName}}
      terminationGracePeriodSeconds: 30
      volumes:
      - configMap:
          defaultMode: 420
          name: skupper-internal
        name: router-config
      - emptyDir: {}
        name: skupper-router-certs
`;

    let unresolvable = {};
    return Expand(template, values, {}, unresolvable);
}

export function SiteApiServiceYaml() {
    let service = {
        apiVersion: 'v1',
        kind:       'Service',
        metadata: {
            name: 'skupperx-site-api',
        },
        spec: {
            type: 'ClusterIP',
            internalTrafficPolicy: 'Cluster',
            ports: [{
                name:      'siteapi',
                port:       8086,
                protocol:  'TCP',
                targetPort: 8086,
            }],
            selector: {
                application: ROUTER_LABEL,
            },
        },
    };

    return "---\n" + dump(service);
}

export function SecretYaml(certificate, profile_name, inject, stateKey) {
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

    return "---\n" + dump(secret);
}

export function LinkConfigMapYaml(linkId, data) {
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

    return "---\n" + dump(link);
}

export function AccessPointConfigMapYaml(apId, data) {
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

    return "---\n" + dump(accessPoint);
}
