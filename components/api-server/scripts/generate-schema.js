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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const IDENT = /^[A-Za-z_]\w*$/;
const SCHEMA_DIR = path.join("components", "schema");

const LICENSE = `/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */`;

// One OpenAPI schema object becomes a table: columns and the tables those columns reference.
// `source` is the spec filename, used when the schema name itself is invalid.
function tableFromSchema(name, schema, source = name) {
    if (!IDENT.test(name)) {
        throw new Error(`${source}: invalid table name ${name}`);
    }
    const properties = schema?.properties;
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
        throw new Error(`${source}: schema ${name} has no properties`);
    }

    const columns = [];
    for (const [prop, def] of Object.entries(properties)) {
        if (!IDENT.test(prop)) {
            throw new Error(`${name}.${prop}: invalid column name`);
        }
        if (!def || typeof def !== "object" || Array.isArray(def)) {
            throw new Error(`${name}.${prop}: property schema must be an object`);
        }
        columns.push(columnFromProperty(name, prop, def));
    }
    if (columns.length === 0) {
        throw new Error(`${name}: no columns`);
    }

    return {
        name,
        columns,
        references: [...new Set(columns.flatMap((column) => column.references))],
    };
}

// Read every .yaml/.yml file under resources/components/schema, in filename order,
// and return the text of schema.sql and drop.sql.
function generateFromResources(resourcesDir) {
    const schemaDir = path.join(resourcesDir, SCHEMA_DIR);
    const files = fs
        .readdirSync(schemaDir)
        .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
        .sort();
    if (files.length === 0) {
        throw new Error(`no schema files in ${SCHEMA_DIR}`);
    }

    const tables = [];
    for (const file of files) {
        const doc = yaml.load(fs.readFileSync(path.join(schemaDir, file), "utf8"));
        if (!doc?.schemas || typeof doc.schemas !== "object" || Array.isArray(doc.schemas)) {
            throw new Error(`${file}: missing schemas map`);
        }
        for (const [name, schema] of Object.entries(doc.schemas)) {
            tables.push(tableFromSchema(name, schema, file));
        }
    }
    return render(orderTables(tables));
}

// Create referenced tables first. Ties keep the order the specs were loaded.
// Duplicate table names, unknown REFERENCES targets, and reference cycles are rejected.
function orderTables(tables) {
    const index = new Map();
    for (const [position, table] of tables.entries()) {
        if (index.has(table.name)) {
            throw new Error(`duplicate table ${table.name}`);
        }
        index.set(table.name, position);
    }
    // Shared enum names must agree before any SQL is emitted.
    validateEnumTypes(tables);

    for (const table of tables) {
        for (const reference of table.references) {
            if (!index.has(reference)) {
                throw new Error(`${table.name} references unknown table ${reference}`);
            }
        }
    }

    const remaining = new Set(index.keys());
    const ordered = [];
    while (remaining.size > 0) {
        // A table may reference itself. Every other target must already be ordered.
        const ready = [...remaining].filter((name) =>
            tables[index.get(name)].references.every(
                (reference) => reference === name || !remaining.has(reference)
            )
        );
        if (ready.length === 0) {
            throw new Error(`cyclic table references: ${[...remaining].join(", ")}`);
        }
        ready.sort((a, b) => index.get(a) - index.get(b));
        const next = ready[0];
        ordered.push(tables[index.get(next)]);
        remaining.delete(next);
    }
    return ordered;
}

// CREATE TYPE and CREATE TABLE in dependency order, then DROP TABLE and DROP TYPE in reverse.
// An enum shared by several columns or spec files is created once and dropped once.
function render(tables) {
    const emittedTypes = new Set();
    const statements = [];
    for (const table of tables) {
        for (const column of table.columns) {
            // The first table that uses a type emits it; later uses of the same name do not.
            if (!column.enumType || emittedTypes.has(column.enumType)) {
                continue;
            }
            emittedTypes.add(column.enumType);
            const labels = column.enumValues.map(sqlString).join(", ");
            statements.push(`CREATE TYPE ${column.enumType} AS ENUM (${labels});`);
        }
        const lines = table.columns.map((column, position) => {
            const comma = position === table.columns.length - 1 ? "" : ",";
            return `    ${column.name} ${column.clause}${comma}`;
        });
        statements.push(`CREATE TABLE ${table.name} (\n${lines.join("\n")}\n);`);
    }

    const remaining = new Set(tables.map((table) => table.name));
    const drops = [];
    for (const table of [...tables].reverse()) {
        drops.push(`DROP TABLE ${table.name};`);
        remaining.delete(table.name);
        for (const typeName of enumTypes(table)) {
            // Keep the type while a table that has not been dropped yet still uses it.
            const stillUsed = tables.some(
                (other) => remaining.has(other.name) && enumTypes(other).includes(typeName)
            );
            if (!stillUsed) {
                drops.push(`DROP TYPE ${typeName};`);
            }
        }
    }

    return {
        schema: withHeader(statements.join("\n\n")),
        drop: withHeader(drops.join("\n")),
    };
}

// x-sql is the full column clause. An OpenAPI enum alone does not create a PostgreSQL type.
// x-sql-enum names a PostgreSQL enum whose labels are the OpenAPI enum values.
// When both are set, x-sql-enum creates the type and x-sql is the column clause.
function columnFromProperty(table, prop, def) {
    const sql = def["x-sql"];
    const enumName = def["x-sql-enum"];
    const hasSql = typeof sql === "string" && sql.trim() !== "";
    const hasEnum = typeof enumName === "string" && enumName.trim() !== "";
    if (!hasSql && !hasEnum) {
        throw new Error(`${table}.${prop}: missing x-sql or x-sql-enum`);
    }

    let enumType;
    let enumValues;
    if (hasEnum) {
        const typeName = enumName.trim();
        if (!IDENT.test(typeName)) {
            throw new Error(`${table}.${prop}: invalid x-sql-enum ${enumName}`);
        }
        if (
            !Array.isArray(def.enum) ||
            def.enum.length === 0 ||
            def.enum.some((value) => typeof value !== "string")
        ) {
            throw new Error(`${table}.${prop}: x-sql-enum requires a non-empty string enum`);
        }
        enumType = typeName;
        enumValues = def.enum;
    }

    const clause = hasSql ? sql.trim() : enumType;
    return {
        name: prop,
        clause,
        enumType,
        enumValues,
        references: referencedTables(table, prop, clause),
    };
}

// Table names after REFERENCES in the column clause. These are the edges used to order tables.
// A REFERENCES keyword whose target is not a plain identifier is an error.
function referencedTables(table, prop, clause) {
    const refs = [];
    for (const match of clause.matchAll(/\bREFERENCES\s+([A-Z_]\w*)\b/gi)) {
        refs.push(match[1]);
    }
    if (refs.length === 0 && /\bREFERENCES\b/i.test(clause)) {
        throw new Error(`${table}.${prop}: could not parse REFERENCES in ${clause}`);
    }
    return refs;
}

// The same x-sql-enum name, in one file or across files, must list the same labels in the
// same order. Label order is part of the CREATE TYPE definition.
function validateEnumTypes(tables) {
    const seen = new Map();
    for (const table of tables) {
        for (const column of table.columns) {
            if (!column.enumType) {
                continue;
            }
            const signature = JSON.stringify(column.enumValues);
            const previous = seen.get(column.enumType);
            if (previous !== undefined && previous !== signature) {
                throw new Error(
                    `PostgreSQL enum ${column.enumType} is declared with different values`
                );
            }
            seen.set(column.enumType, signature);
        }
    }
}

function enumTypes(table) {
    return [
        ...new Set(table.columns.flatMap((column) => (column.enumType ? [column.enumType] : []))),
    ];
}

function sqlString(value) {
    return `'${value.replaceAll("'", "''")}'`;
}

function withHeader(body) {
    return `${LICENSE}\n\n${body.endsWith("\n") ? body : `${body}\n`}`;
}

function isMainModule() {
    if (!process.argv[1]) {
        return false;
    }
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
    const resourcesDir = path.join(import.meta.dirname, "../resources");
    const { schema, drop } = generateFromResources(resourcesDir);
    fs.writeFileSync(path.join(resourcesDir, "schema.sql"), schema);
    fs.writeFileSync(path.join(resourcesDir, "drop.sql"), drop);
}
