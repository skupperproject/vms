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

import rhea from 'rhea';
import { Log } from "./log.js"

let nextCid = 1
let nextMessageId = 1
const inFlight = {} // { cid : handler }

const DEFAULT_TIMEOUT_SECONDS = 5

const rhea_handlers = function () {
  rhea.options.enable_sasl_external = true

  rhea.on("connection_open", function (context) {
    const conn = context.connection.skxConn
    Log(`AMQP Connection '${conn.logName}' is open`)
  })

  rhea.on("receiver_open", function (context) {
    const conn = context.connection.skxConn
    if (context.receiver == conn.replyReceiver) {
      const firstTime = conn.replyTo == undefined
      conn.replyTo = context.receiver.source.address
      Log(
        `AMQP dynamic reply address for connection '${conn.logName}': ${conn.replyTo}`,
      )

      if (firstTime) {
        conn.senders.forEach((sender) => {
          if (sender.sendable && !sender.notified) {
            sender.notified = true
            sender.onSendable(sender.context)
          }
        })
      }
    } else {
      const rx = context.receiver.skxReceiver
      if (rx && rx.onAddress) {
        rx.onAddress(rx.context, context.receiver.source.address)
      }
    }
  })

  rhea.on("sendable", function (context) {
    const conn = context.connection.skxConn
    conn.senders.forEach((sender) => {
      if (sender.amqpSender == context.sender) {
        if (!sender.notified) {
          sender.sendable = true
          if (conn.replyTo != undefined) {
            sender.notified = true
            Log(`AMQP Sender '${sender.logName}' is now reachable`)
            sender.onSendable(sender.context)
          }
        }
      }
    })
  })

  rhea.on("message", function (context) {
    const conn = context.connection.skxConn
    const message = context.message
    const cid = message.correlation_id
    let handler
    if (context.receiver == conn.replyReceiver) {
      if (cid) {
        handler = inFlight[cid]
        if (handler) {
          delete inFlight[cid]
          handler(message)
        }
      } else {
        Log("Received message on reply receiver with no correlation ID")
      }
    } else {
      const receiver = context.receiver.skxReceiver
      if (receiver) {
        receiver.onMessage(
          receiver.context,
          message.application_properties,
          message.body,
          (replyAp, replyBody) => {
            conn.anonSender.send({
              to: message.reply_to,
              correlation_id: message.correlation_id,
              application_properties: replyAp,
              body: replyBody,
            })
          },
        )
      }
    }
  })
}

export function OpenConnection(
  logName,
  host = "localhost",
  port = "5672",
  transport = undefined,
  ca = undefined,
  cert = undefined,
  key = undefined,
) {
  const conn = {
    amqpConnection: rhea.connect({
      host: host,
      hostname: host,
      transport: transport,
      port: port,
      ca: ca,
      key: key,
      cert: cert,
    }),
    senders: [],
    receivers: [],
    logName: logName,
  }

  conn.replyTo = undefined
  conn.replyReceiver = conn.amqpConnection.open_receiver({
    source: { dynamic: true },
  })
  conn.anonSender = conn.amqpConnection.open_sender()
  conn.amqpConnection.skxConn = conn

  return conn
}

export function CloseConnection(conn) {
  conn.amqpConnection.close()
}

export function OpenSender(
  logName,
  conn,
  address,
  onSendable = undefined,
  context = undefined,
) {
  if (onSendable) {
    //
    // This is the synchronous version of the function
    //
    const sender = {
      conn: conn,
      amqpSender: conn.amqpConnection.open_sender(address),
      onSendable: onSendable,
      context: context,
      logName: logName,
      sendable: false,
      notified: false,
    }

    sender.amqpSender.skxSender = sender
    conn.senders.push(sender)

    return sender
  } else {
    //
    // This is the asynchronous version of the function which does not resolve until the sender is sendable
    //
    return new Promise((resolve, reject) => {
      const sender = {
        conn: conn,
        amqpSender: null,
        onSendable: null,
        context: null,
        logName: logName,
        sendable: false,
        notified: false,
      }

      sender.onSendable = (unusedContext) => {
        resolve(sender)
      }

      sender.amqpSender = conn.amqpConnection.open_sender(address)
      sender.amqpSender.skxSender = sender
      conn.senders.push(sender)
    })
  }
}

export function OpenReceiver(conn, address, onMessage, context = undefined) {
  const receiver = {
    amqpReceiver: conn.amqpConnection.open_receiver(address),
    onMessage: onMessage,
    onAddress: null,
    context: context,
  }

  receiver.amqpReceiver.skxReceiver = receiver
  conn.receivers.push(receiver)

  return receiver
}

export function OpenDynamicReceiver(
  conn,
  onMessage,
  onAddress,
  context = undefined,
) {
  const receiver = {
    amqpReceiver: conn.amqpConnection.open_receiver({
      source: { dynamic: true },
    }),
    onMessage: onMessage,
    onAddress: onAddress,
    context: context,
  }

  receiver.amqpReceiver.skxReceiver = receiver
  conn.receivers.push(receiver)

  return receiver
}

export function SendMessage(sender, messageBody, ap = {}, destination = null) {
  const messageId = nextMessageId
  nextMessageId++
  const message = {
    message_id: messageId,
    reply_to: sender.conn.replyTo,
    body: messageBody,
    application_properties: ap,
  }
  if (destination) {
    message.to = destination
  }
  sender.amqpSender.send(message)
}

export function Request(
  sender,
  messageBody,
  ap = {},
  destination = null,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
) {
  return new Promise((resolve, reject) => {
    const cid = nextCid
    const msgId = nextMessageId
    const timer = setTimeout(() => {
      delete inFlight[cid]
      reject(Error("AMQP request/response timeout"))
    }, timeoutSeconds * 1000)
    nextMessageId++
    nextCid++
    inFlight[cid] = (response) => {
      clearTimeout(timer)
      resolve([response.application_properties, response.body])
    }
    const message = {
      message_id: msgId,
      reply_to: sender.conn.replyTo,
      correlation_id: cid,
      application_properties: ap,
      body: messageBody,
    }
    if (destination) {
      message.to = destination
    }
    sender.amqpSender.send(message)
  })
}

export async function Start() {
  Log("[AMQP module started]")
  rhea_handlers()
}
