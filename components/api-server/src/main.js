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

import { Log } from "@vms/modules/log";
import { startApiServer } from "./api-server.js";
import { DatabaseError } from "pg";

const VERSION = "0.1.0";

Log(`VMS API server version ${VERSION}`);

export async function Main() {
    try {
        await startApiServer();
        Log("[API server initialization completed successfully]");
    } catch (error) {
        if (error instanceof DatabaseError || error?.message?.toLowerCase().includes("postgres")) {
            Log(
                `API server initialization failed: Postgres-related error detected. Please check your Postgres deployment. \n ${error.stack}`
            );
        } else {
            Log(`API server initialization failed: ${error.stack}`);
        }

        process.exit(1);
    }
}
