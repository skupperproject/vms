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

import rhea from 'rhea/dist/rhea-umd';

//
// One AMQP/WebSocket connection per watch. Opening several receivers on a single browser
// WebSocket session hits rhea frame sequencing ("expected N, got N+1", "transfer after detach").
//

export function CreateWatch(apiPath, updateCb) {
    const container = rhea.create_container();
    const ws = container.websocket_connect(WebSocket);
    const connection = container.connect({
        connection_details: ws('/binary', ['AMQPWSB10', 'amqp']),
        reconnect: false,
    });

    container.on('message', function (context) {
        try {
            context.receiver.options._update(context.message);
        } catch (err) {
            console.log('Exception in messaging handling', err.message);
        }
    });

    container.on('receiver_close', function (context) {
        console.log('receiver_close', context.receiver.target.address);
    });

    const link = connection.open_receiver(apiPath);
    link.options._update = updateCb;
    return {
        receiver: link,
        connection,
    };
}

export function CancelWatch(watchContext) {
    try {
        watchContext.receiver.close();
    } catch {
        /* ignore */
    }
    try {
        if (watchContext.connection && typeof watchContext.connection.close === 'function') {
            watchContext.connection.close();
        }
    } catch {
        /* ignore */
    }
}
