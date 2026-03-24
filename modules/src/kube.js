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

import { Log } from "./log.js"
import * as common from "./common.js"

const WATCH_ERROR_THRESHOLD = 10 // Log if threshold is exceeded in a minute's time.

var fs
var YAML
var k8s
var kc
var client
var v1Api
var v1AppApi
var customApi
var secretWatch
var certificateWatch
var configMapWatch
var routeWatch
var serviceWatch
var podWatch
var routerAccessWatch
var watchErrorCount = 0
var lastWatchError
var namespace = "default"

export function Annotation(obj, key) {
  if (obj && obj.metadata && obj.metadata.annotations) {
    return obj.metadata.annotations[key]
  }

  return undefined
}

export function Controlled(obj) {
  return Annotation(obj, common.META_ANNOTATION_SKUPPERX_CONTROLLED) == "true"
}

export function Namespace() {
  return namespace
}

export async function Start(k8s_mod, fs_mod, yaml_mod, standalone_namespace) {
  k8s = k8s_mod
  fs = fs_mod
  YAML = yaml_mod

  kc = new k8s.KubeConfig()
  if (!standalone_namespace) {
    kc.loadFromCluster()
  } else {
    kc.loadFromDefault()
  }

  client = k8s.KubernetesObjectApi.makeApiClient(kc)
  v1Api = kc.makeApiClient(k8s.CoreV1Api)
  v1AppApi = kc.makeApiClient(k8s.AppsV1Api)
  customApi = kc.makeApiClient(k8s.CustomObjectsApi)

  secretWatch = new k8s.Watch(kc)
  certificateWatch = new k8s.Watch(kc)
  configMapWatch = new k8s.Watch(kc)
  routeWatch = new k8s.Watch(kc)
  serviceWatch = new k8s.Watch(kc)
  podWatch = new k8s.Watch(kc)
  routerAccessWatch = new k8s.Watch(kc)

  try {
    if (standalone_namespace) {
      namespace = standalone_namespace
    } else {
      namespace = fs.readFileSync(
        "/var/run/secrets/kubernetes.io/serviceaccount/namespace",
        "utf8",
      )
    }
    Log(`Running in namespace: ${namespace}`)
  } catch (err) {
    Log(`Unable to determine namespace, assuming ${namespace}`)
  }
}

export async function GetIssuers() {
  let list = await customApi.listNamespacedCustomObject({
    group: "cert-manager.io",
    version: "v1",
    namespace: namespace,
    plural: "issuers",
  })
  return list.items
}

export async function LoadIssuer(name) {
  return await customApi.getNamespacedCustomObject({
    group: "cert-manager.io",
    version: "v1",
    namespace: namespace,
    plural: "issuers",
    name: name,
  })
}

export async function DeleteIssuer(name) {
  await customApi.deleteNamespacedCustomObject({
    group: "cert-manager.io",
    version: "v1",
    namespace: namespace,
    plural: "issuers",
    name: name,
  })
}

export async function GetCertificates() {
  let list = await customApi.listNamespacedCustomObject({
    group: "cert-manager.io",
    version: "v1",
    namespace: namespace,
    plural: "certificates",
  })
  return list.items
}

export async function LoadCertificate(name) {
  return await customApi.getNamespacedCustomObject({
    group: "cert-manager.io",
    version: "v1",
    namespace: namespace,
    plural: "certificates",
    name: name,
  })
}

export async function DeleteCertificate(name) {
  await customApi.deleteNamespacedCustomObject({
    group: "cert-manager.io",
    version: "v1",
    namespace: namespace,
    plural: "certificates",
    name: name,
  })
}

export async function GetSecrets() {
  let list = await v1Api.listNamespacedSecret({ namespace: namespace })
  return list.items
}

export async function LoadSecret(name) {
  try {
    return await v1Api.readNamespacedSecret({
      name: name,
      namespace: namespace,
    })
  } catch (e) {}
  return undefined
}

export async function ReplaceSecret(name, obj) {
  await v1Api.replaceNamespacedSecret({
    name: name,
    namespace: namespace,
    body: obj,
  })
}

export async function DeleteSecret(name) {
  await v1Api.deleteNamespacedSecret({ name: name, namespace: namespace })
}

export async function GetConfigmaps() {
  let list = await v1Api.listNamespacedConfigMap({ namespace: namespace })
  return list.items
}

export async function LoadConfigmap(name) {
  try {
    return await v1Api.readNamespacedConfigMap({
      name: name,
      namespace: namespace,
    })
  } catch (e) {}
  return undefined
}

export async function ReplaceConfigmap(name, obj) {
  await v1Api.replaceNamespacedConfigMap({
    name: name,
    namespace: namespace,
    body: obj,
  })
}

export async function DeleteConfigmap(name) {
  await v1Api.deleteNamespacedConfigMap({ name: name, namespace: namespace })
}

export async function GetPods() {
  let list = await v1Api.listNamespacedPod({ namespace: namespace })
  return list.items
}

export async function LoadPod(name) {
  try {
    return await v1Api.readNamespacedPod({ name: name, namespace: namespace })
  } catch (e) {}
  return undefined
}

export async function ReplacePod(name, obj) {
  await v1Api.ReplaceNamespacedPod({
    name: name,
    namespace: namespace,
    body: obj,
  })
}

export async function DeletePod(name) {
  await v1Api.DeleteNamespacedPod({ name: name, namespace: namespace })
}

export async function GetDeployments() {
  let list = await v1AppApi.listNamespacedDeployment({ namespace: namespace })
  return list.items
}

export async function GetServices() {
  let list = await v1Api.listNamespacedService({ namespace: namespace })
  return list.items
}

export async function LoadService(name) {
  try {
    return await v1Api.readNamespacedService({
      name: name,
      namespace: namespace,
    })
  } catch (e) {}
  return undefined
}

export async function ReplaceService(name, obj) {
  await v1Api.replaceNamespacedService({
    name: name,
    namespace: namespace,
    body: obj,
  })
}

export async function DeleteService(name) {
  await v1Api.deleteNamespacedService({ name: name, namespace: namespace })
}

export async function GetRoutes() {
  let list = await customApi.listNamespacedCustomObject({
    group: "route.openshift.io",
    version: "v1",
    namespace: namespace,
    plural: "routes",
  })
  return list.items
}

export async function DeleteRoute(name) {
  await customApi.deleteNamespacedCustomObject({
    group: "route.openshift.io",
    version: "v1",
    namespace: namespace,
    plural: "routes",
    name: name,
  })
}

export async function LoadDeployment(name) {
  return await v1AppApi.readNamespacedDeployment({
    name: name,
    namespace: namespace,
  })
}

export async function DeleteDeployment(name) {
  await v1AppApi.deleteNamespacedDeployment({
    name: name,
    namespace: namespace,
  })
}

export async function GetSites() {
  let list = await customApi.listNamespacedCustomObject({
    group: "skupper.io",
    version: "/v2alpha1",
    namespace: namespace,
    plural: "sites",
  })
  return list.items
}

var secretWatches = []

const startWatchSecrets = function () {
  secretWatch.watch(
    `/api/v1/namespaces/${namespace}/secrets`,
    {},
    (type, apiObj, watchObj) => {
      for (const callback of secretWatches) {
        callback(type, apiObj)
      }
    },
    (err) => {
      if (err) {
        watchErrorCount++
        lastWatchError = `Secrets: ${err}`
      }
      startWatchSecrets()
    },
  )
}

export function WatchSecrets(callback) {
  secretWatches.push(callback)
  if (secretWatches.length == 1) {
    startWatchSecrets()
  }
}

var configMapWatches = []

const startWatchConfigMaps = function () {
  configMapWatch.watch(
    `/api/v1/namespaces/${namespace}/configmaps`,
    {},
    (type, apiObj, watchObj) => {
      for (const callback of configMapWatches) {
        callback(type, apiObj)
      }
    },
    (err) => {
      if (err) {
        watchErrorCount++
        lastWatchError = `ConfigMaps: ${err}`
      }
      startWatchConfigMaps()
    },
  )
}

export function WatchConfigMaps(callback) {
  configMapWatches.push(callback)
  if (configMapWatches.length == 1) {
    startWatchConfigMaps()
  }
}

var certificateWatches = []

const startWatchCertificates = function () {
  certificateWatch.watch(
    `/apis/cert-manager.io/v1/namespaces/${namespace}/certificates`,
    {},
    (type, apiObj, watchObj) => {
      for (const callback of certificateWatches) {
        callback(type, apiObj)
      }
    },
    (err) => {
      if (err) {
        watchErrorCount++
        lastWatchError = `Certificates: ${err}`
      }
      startWatchCertificates()
    },
  )
}

export function WatchCertificates(callback) {
  certificateWatches.push(callback)
  if (certificateWatches.length == 1) {
    startWatchCertificates()
  }
}

var routeWatches = []

const startWatchRoutes = function () {
  routeWatch.watch(
    `/apis/route.openshift.io/v1/namespaces/${namespace}/routes`,
    {},
    (type, apiObj, watchObj) => {
      for (const callback of routeWatches) {
        callback(type, apiObj)
      }
    },
    (err) => {
      if (err) {
        watchErrorCount++
        lastWatchError = `Routes: ${err}`
      }
      startWatchRoutes()
    },
  )
}

export function WatchRoutes(callback) {
  routeWatches.push(callback)
  if (routeWatches.length == 1) {
    startWatchRoutes()
  }
}

var serviceWatches = []

const startWatchServices = function () {
  serviceWatch.watch(
    `/api/v1/namespaces/${namespace}/services`,
    {},
    (type, apiObj, watchObj) => {
      for (const callback of serviceWatches) {
        callback(type, apiObj)
      }
    },
    (err) => {
      if (err) {
        watchErrorCount++
        lastWatchError = `Services: ${err}`
      }
      startWatchServices()
    },
  )
}

export function WatchServices(callback) {
  serviceWatches.push(callback)
  if (serviceWatches.length == 1) {
    startWatchServices()
  }
}

var podWatches = []

const startWatchPods = function () {
  podWatch.watch(
    `/api/v1/namespaces/${namespace}/pods`,
    {},
    (type, apiObj, watchObj) => {
      for (const callback of podWatches) {
        callback(type, apiObj)
      }
    },
    (err) => {
      if (err) {
        watchErrorCount++
        lastWatchError = `Pods: ${err}`
      }
      startWatchPods()
    },
  )
}

export function WatchPods(callback) {
  podWatches.push(callback)
  if (podWatches.length == 1) {
    startWatchPods()
  }
}

var routerAccessWatches = []
const startWatchRouterAccesses = function () {
  routerAccessWatch.watch(
    `/apis/skupper.io/v2alpha1/namespaces/${namespace}/routeraccesses`,
    {},
    (type, apiObj, watchObj) => {
      for (const callback of routerAccessWatches) {
        callback(type, apiObj)
      }
    },
    (err) => {
      if (err) {
        watchErrorCount++
        lastWatchError = `Pods: ${err}`
      }
      startWatchRouterAccesses()
    },
  )
}

export function startWatchRouterAccessesFn(callback) {
  routerAccessWatches.push(callback)
  if (routerAccessWatches.length == 1) {
    startWatchRouterAccesses()
  }
}

// Keep the old export name for compatibility
export { startWatchRouterAccessesFn as startWatchRouterAccesses }

export async function ApplyObject(obj) {
  try {
    if (obj.metadata.annotations == undefined) {
      obj.metadata.annotations = {}
    }
    obj.metadata.annotations[common.META_ANNOTATION_SKUPPERX_CONTROLLED] =
      "true"
    obj.metadata.namespace = namespace
    Log(`Creating resource: ${obj.kind} ${obj.metadata.name}`)
    return await client.create(obj)
  } catch (error) {
    Log(
      `Exception in kube.ApplyObject: kind: ${obj.kind}, name: ${obj.metadata.name}:  ${error.message}`,
    )
  }
}

//
// Watchers normally fail (are aborted) after a number of minutes, depending on the configuration of the platform.
// We do not wish to pollute the log with benign watch-fail indications.  However, there are failure modes like
// lack of watch permissions that will fail immediately.  We do need to see these in the logs to know that the role
// rights need to be fixed.  This mechanism will provide legit watch errors every minute.
//
const logWatchErrors = function () {
  if (watchErrorCount > WATCH_ERROR_THRESHOLD) {
    Log(
      `Watch error rate exceeded threshold:  ${watchErrorCount} in the last minute - ${lastWatchError}`,
    )
  }
  watchErrorCount = 0
  setTimeout(logWatchErrors, 60 * 1000)
}

export async function ApplyYaml(yaml) {
  setTimeout(logWatchErrors, 60 * 1000) // TODO - Check this.  It's probably not right
  let obj = YAML.parse(yaml)
  return await ApplyObject(obj)
}
