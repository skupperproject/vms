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

import rhea from 'rhea/dist/rhea-umd'

/** One AMQP session per watch — avoids shared session incoming delivery-id sequencing across links (frame sequence errors). */
let linkOps = Promise.resolve()

function enqueue(fn) {
  const run = linkOps.then(fn)
  linkOps = run.catch(() => {})
  return run
}

function waitForReceiverOpen(link) {
  return new Promise((resolve, reject) => {
    if (link.is_open?.()) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      link.removeListener('receiver_open', onOpen)
      link.removeListener('receiver_error', onErr)
      reject(new Error('receiver_open timed out'))
    }, 30000)

    function onOpen() {
      clearTimeout(timer)
      link.removeListener('receiver_error', onErr)
      resolve()
    }
    function onErr(err) {
      clearTimeout(timer)
      link.removeListener('receiver_open', onOpen)
      reject(err || new Error('receiver_error'))
    }

    link.once('receiver_open', onOpen)
    link.once('receiver_error', onErr)
  })
}

function closeReceiverLink(link) {
  return new Promise((resolve) => {
    if (!link) {
      resolve()
      return
    }
    if (link.options) {
      link.options._update = null
    }
    if (link.is_closed?.()) {
      resolve()
      return
    }

    const timer = setTimeout(resolve, 10000)
    const done = () => {
      clearTimeout(timer)
      link.removeListener('receiver_error', onErr)
      resolve()
    }
    function onErr() {
      done()
    }

    link.once('receiver_close', done)
    link.once('receiver_error', onErr)
    try {
      link.close()
    } catch {
      done()
    }
  })
}

async function ensureConnectionOpen(connection) {
  if (connection.is_open()) {
    return
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.removeListener('connection_open', onOpen)
      connection.removeListener('connection_error', onErr)
      reject(new Error('connection_open timed out'))
    }, 30000)

    function onOpen() {
      clearTimeout(timer)
      connection.removeListener('connection_error', onErr)
      resolve()
    }
    function onErr(err) {
      clearTimeout(timer)
      connection.removeListener('connection_open', onOpen)
      reject(err || new Error('connection_error'))
    }

    connection.once('connection_open', onOpen)
    connection.once('connection_error', onErr)
  })
}

/**
 * One WebSocket + one receiver link per watch (no multiplexing). Serializes open/close for React Strict Mode.
 *
 * @param {string} apiPath
 * @param {function} updateCb
 * @returns {Promise<{ receiver: object, connection: object }>}
 */
export function CreateWatch(apiPath, updateCb) {
  return enqueue(async () => {
    const container = rhea.create_container()
    const ws = container.websocket_connect(WebSocket)
    const connection = container.connect({
      connection_details: ws(['binary', 'AMQPWSB10', 'amqp']),
      reconnect: false,
    })

    container.on('message', function (context) {
      try {
        const fn = context.receiver?.options?._update
        if (typeof fn === 'function') {
          fn(context.message)
        }
      } catch (err) {
        console.log('Exception in messaging handling', err.message)
      }
    })

    await ensureConnectionOpen(connection)

    const link = connection.open_receiver(apiPath)
    link.options._update = updateCb
    await waitForReceiverOpen(link)

    return { receiver: link, connection }
  })
}

export function CancelWatch(watchContext) {
  if (!watchContext?.receiver) {
    return Promise.resolve()
  }
  const { receiver, connection } = watchContext
  return enqueue(async () => {
    await closeReceiverLink(receiver)
    try {
      if (connection && typeof connection.close === 'function') {
        connection.close()
      }
    } catch {
      /* ignore */
    }
  })
}
