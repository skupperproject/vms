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

import * as amqp from "./amqp.js"
import { Log } from "./log.js"

var mgmtSender
var ready = false
var waiters = []

const QUERY_TIMEOUT_SECONDS = 5

const convertBodyToItems = function (body) {
  let keys = body.attributeNames
  let items = []
  body.results.forEach((values) => {
    let item = {}
    for (let i = 0; i < keys.length; i++) {
      item[keys[i]] = values[i]
    }
    items.push(item)
  })
  return items
}

export async function ListManagementEntity(
  entityType,
  timeout,
  attributes = [],
) {
  let requestAp = {
    operation: "QUERY",
    type: "org.amqp.management",
    entityType: entityType,
    name: "self",
  }
  let requestBody = {
    attributeNames: attributes,
  }

  const [replyAp, replyBody] = await amqp.Request(
    mgmtSender,
    requestBody,
    requestAp,
    null,
    timeout,
  )

  if (replyAp.statusCode == 200) {
    let items = convertBodyToItems(replyBody)
    return items
  }

  throw Error(replyAp.statusDescription)
}

export async function CreateManagementEntity(entityType, name, data, timeout) {
  let requestAp = {
    operation: "CREATE",
    type: entityType,
    name: name,
  }

  const [replyAp, replyBody] = await amqp.Request(
    mgmtSender,
    data,
    requestAp,
    null,
    timeout,
  )

  if (replyAp.statusCode == 201) {
    return replyBody
  }

  throw Error(replyAp.statusDescription)
}

export async function DeleteManagementEntity(entityType, name, timeout) {
  let requestAp = {
    operation: "DELETE",
    type: entityType,
    name: name,
  }

  const [replyAp, replyBody] = await amqp.Request(
    mgmtSender,
    undefined,
    requestAp,
    null,
    timeout,
  )

  if (replyAp.statusCode == 204) {
    return replyBody
  }

  throw Error(replyAp.statusDescription)
}

export async function ListSslProfiles(attributes = []) {
  return await ListManagementEntity(
    "io.skupper.router.sslProfile",
    QUERY_TIMEOUT_SECONDS,
    attributes,
  )
}

export async function CreateSslProfile(name, obj) {
  await CreateManagementEntity(
    "io.skupper.router.sslProfile",
    name,
    obj,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function DeleteSslProfile(name) {
  await DeleteManagementEntity(
    "io.skupper.router.sslProfile",
    name,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function ListConnectors(attributes = []) {
  return await ListManagementEntity(
    "io.skupper.router.connector",
    QUERY_TIMEOUT_SECONDS,
    attributes,
  )
}

export async function CreateConnector(name, obj) {
  await CreateManagementEntity(
    "io.skupper.router.connector",
    name,
    obj,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function DeleteConnector(name) {
  await DeleteManagementEntity(
    "io.skupper.router.connector",
    name,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function ListListeners(attributes = []) {
  return await ListManagementEntity(
    "io.skupper.router.listener",
    QUERY_TIMEOUT_SECONDS,
    attributes,
  )
}

export async function CreateListener(name, obj) {
  await CreateManagementEntity(
    "io.skupper.router.listener",
    name,
    obj,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function DeleteListener(name) {
  await DeleteManagementEntity(
    "io.skupper.router.listener",
    name,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function ListAutoLinks(attributes = []) {
  return await ListManagementEntity(
    "io.skupper.router.router.config.autoLink",
    QUERY_TIMEOUT_SECONDS,
    attributes,
  )
}

export async function CreateAutoLink(name, obj) {
  await CreateManagementEntity(
    "io.skupper.router.router.config.autoLink",
    name,
    obj,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function DeleteAutoLink(name) {
  await DeleteManagementEntity(
    "io.skupper.router.router.config.autoLink",
    name,
    QUERY_TIMEOUT_SECONDS,
  )
}

export async function ListAddresses(attributes = []) {
  return await ListManagementEntity(
    "io.skupper.router.router.address",
    QUERY_TIMEOUT_SECONDS,
    attributes,
  )
}

export async function NotifyApiReady(onApiReady) {
  if (ready) {
    onApiReady()
  } else {
    waiters.push(onApiReady)
  }
}

const onSendable = function (unused) {
  if (!ready) {
    ready = true
    waiters.forEach((waiter) => waiter())
    waiters = []
  }
}

export async function Start(connection) {
  Log("[Router-management module started]")
  mgmtSender = await amqp.OpenSender("Management", connection, "$management")
  onSendable()
}
