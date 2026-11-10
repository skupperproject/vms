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

import { Pool } from "pg";

export function createPGPool() {
    return new Pool({ user: "postgres", password: process.env.PGPASSWORD });
}

// Dynamically generates insert query for tables with optional columns with Postgres defaults.
export function insertRow(table, columns) {
    const names = [];
    const values = [];
    for (const [name, value] of Object.entries(columns)) {
        if (value !== undefined) {
            names.push(name);
            values.push(value);
        }
    }
    const placeholders = names.map((_, index) => `$${index + 1}`);
    return {
        text: `INSERT INTO ${table}(${names.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING Id`,
        values,
    };
}

// Dynamically generates update queries for tables with optional columns.
export function updateRow(table, columns, id) {
    const names = [];
    const values = [];
    for (const [name, value] of Object.entries(columns)) {
        if (value !== undefined) {
            names.push(name);
            values.push(value);
        }
    }
    const assignments = names.map((name, index) => `${name} = $${index + 1}`);
    values.push(id);
    return {
        text: `UPDATE ${table} SET ${assignments.join(", ")} WHERE Id = $${values.length} RETURNING *`,
        values,
    };
}
