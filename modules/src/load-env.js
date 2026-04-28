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

/**
 * Loads the first `.env` file found when walking up from `process.cwd()`.
 * Does not override variables already set in the environment (same as dotenv default).
 */
import { config } from "dotenv"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

function findEnvPath() {
  let dir = process.cwd()
  for (;;) {
    const candidate = join(dir, ".env")
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(dir)

    // If we've reached the root directory and no .env file has been found, return null
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}

const envPath = findEnvPath()
if (envPath) {
  config({ path: envPath })
}
