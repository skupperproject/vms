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
CREATE TABLE Footprints (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    ApiUrl TEXT        -- URL to reach the API of the responsible Deployment Manager
);

--
-- A DeploymentTarget is a unit of configuration that is handled by a single Deployment Manager
-- and is tracked as a whole.  For Kubernetes, there will typically be one DeploymentTarget for
-- each target name space.
--
CREATE TABLE DeploymentTargets (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    Footprint UUID REFERENCES DeploymentFootprints,
    RepositoryPath TEXT   -- Path in the repository where artifacts should be placed
);

CREATE TABLE Locations (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    Description TEXT,
    IsClass BOOLEAN DEFAULT false,
    OfClass UUID REFERENCES Locations (Id) ON DELETE CASCADE
);

CREATE TYPE NetworkType AS ENUM ('dedicated', 'shared');

CREATE TABLE Networks (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT UNIQUE,
    Type NetworkType,
    Owner TEXT
);

CREATE TABLE NetworkSites (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT,
    Network UUID REFERENCES Networks,
    Location UUID REFERENCES Locations,
    DeploymentTarget UUID REFERENCES DeploymentTargets
);

CREATE TYPE AccessPointRole AS ENUM ('inter-router', 'edge', 'normal');

CREATE TABLE NetworkAccessPoints (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT,
    NetworkSite UUID REFERENCES NetworkSites ON DELETE CASCADE,
    Kind AccessPointRole,
    Hostname TEXT,
    Port TEXT,
    BindHost TEXT DEFAULT ''
);

CREATE TABLE NetworkLinks (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AccessPoint UUID REFERENCES NetworkAccessPoints ON DELETE CASCADE,
    ConnectingSite UUID REFERENCES NetworkSites ON DELETE CASCADE,
    Cost integer DEFAULT 1
);

CREATE TABLE SharedSites (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT,
    Network UUID REFERENCES Networks (Id) ON DELETE CASCADE,
    Location UUID REFERENCSE Locations,
    DeploymentTarget UUID REFERENCES DeploymentTargets,
    Location UUID REFERENCES Locations
);

CREATE TABLE SharedSiteLinks (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AccessPoint UUID REFERENCES NetworkAccessPoints ON DELETE CASCADE,
    ConnectingSite UUID REFERENCES SharedSites ON DELETE CASCADE
);

CREATE TABLE ApplicationNetworks (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Network UUID REFERENCES Networks (Id) ON DELETE CASCADE,
    VanId text,
    StartTime timestamptz DEFAULT now(),
    EndTime timestamptz,
    DeleteDelay interval second (0) DEFAULT '0 minutes',
    Owner TEXT
);

CREATE TABLE ApplicationNetworkLocation (
    ApplicationNetwork UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Location UUID REFERENCES Locations ON DELETE CASCADE
);

