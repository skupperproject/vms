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

//
// AMQP addresses
//
export const API_CONTROLLER_ADDRESS = "skx/sync/mgmtcontroller"
export const CLAIM_ASSERT_ADDRESS = "skx/claim"

//
// Selector labels
//
export const APPLICATION_ROUTER_LABEL = "skx-router"

//
// Kubernetes annotation keys
//
export const META_ANNOTATION_SKUPPERX_CONTROLLED = "skupper.io/skupperx-controlled"
export const META_ANNOTATION_STATE_HASH = "skx/state-hash"
export const META_ANNOTATION_STATE_KEY = "skx/state-key"
export const META_ANNOTATION_STATE_DIR = "skx/state-dir"
export const META_ANNOTATION_STATE_TYPE = "skx/state-type"
export const META_ANNOTATION_STATE_ID = "skx/state-id"
export const META_ANNOTATION_TLS_INJECT = "skx/tls-inject"

//
// State types
//
export const STATE_TYPE_LINK = "link"
export const STATE_TYPE_ACCESS_POINT = "accesspoint"
export const INJECT_TYPE_ACCESS_POINT = "accesspoint"
export const INJECT_TYPE_SITE = "site"

//
// Kubernetes object names
//
export const ROUTER_SERVICE_NAME = "skx-router"
export const MEMBER_CONFIG_MAP_NAME = "skx-member"

//
// Skupper CRD constants
//
export const CRD_API_VERSION = "skupper.io/v2alpha1"
