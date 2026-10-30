/*
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
 */

--
-- Footprints into which DeploymentTargets can be deployed.  Rows in this table are
-- created as a byproduct of Deployment Manager services.  There is one Footprint row
-- for each Deployment Manager running.
--
CREATE TABLE Footprint (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    ApiUrl TEXT        -- URL to reach the API of the responsible Deployment Manager
);

--
-- A DeploymentTarget is a unit of configuration that is handled by a single Deployment Manager
-- and is tracked as a whole.  For Kubernetes, there will typically be one DeploymentTarget for
-- each target name space.
--
CREATE TABLE DeploymentTarget (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    Footprint UUID REFERENCES Footprint,
    RepositoryPath TEXT,   -- Path in the repository where artifacts should be placed
    Status TEXT,
    ChangeStatus TEXT
);

CREATE TABLE Location (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    Description TEXT,
    IsClass BOOLEAN DEFAULT false,
    OfClass UUID REFERENCES Location (Id) ON DELETE CASCADE
);

CREATE TYPE NetworkType AS ENUM ('dedicated', 'shared');

CREATE TABLE Network (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    Type NetworkType,
    Owner TEXT
);

CREATE TABLE NetworkSite (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT,
    Network UUID REFERENCES Network,
    Location UUID REFERENCES Location,
    DeploymentTarget UUID REFERENCES DeploymentTarget
);

CREATE TYPE AccessPointRole AS ENUM ('inter-router', 'edge', 'normal');

CREATE TABLE NetworkAccessPoint (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT,
    NetworkSite UUID REFERENCES NetworkSite ON DELETE CASCADE,
    Kind AccessPointRole,
    Hostname TEXT,
    Port TEXT,
    BindHost TEXT DEFAULT ''
);

CREATE TABLE NetworkLink (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AccessPoint UUID REFERENCES NetworkAccessPoint ON DELETE CASCADE,
    ConnectingSite UUID REFERENCES NetworkSite ON DELETE CASCADE,
    Cost integer DEFAULT 1
);

CREATE TABLE SharedSite (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT,
    Network UUID REFERENCES Network (Id) ON DELETE CASCADE,
    DeploymentTarget UUID REFERENCES DeploymentTarget,
    Location UUID REFERENCES Location
);

CREATE TABLE SharedSiteLink (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AccessPoint UUID REFERENCES NetworkAccessPoint ON DELETE CASCADE,
    ConnectingSite UUID REFERENCES SharedSite ON DELETE CASCADE
);

CREATE TABLE ApplicationNetwork (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Network UUID REFERENCES Network (Id) ON DELETE CASCADE,
    VanId text,
    StartTime timestamptz DEFAULT now(),
    EndTime timestamptz,
    DeleteDelay interval second (0) DEFAULT '0 minutes',
    Owner TEXT
);

CREATE TABLE ApplicationNetworkLocation (
    ApplicationNetwork UUID REFERENCES ApplicationNetwork ON DELETE CASCADE,
    Location UUID REFERENCES Location ON DELETE CASCADE
);

