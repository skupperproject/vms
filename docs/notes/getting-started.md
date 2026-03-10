# Skupper VMS Hello World 

This tutorial will walk you through running the vms management server, setting up a management backbone on a Kubernetes cluster, and connecting a van to the backbone from a second Kubernetes cluster. 

## Prerequisites:

* Access to at least two Kubernetes clusters, from [any provider you
  choose][kube-providers].

  **NOTE:** The cluster running the management backbone must be an OpenShift cluster as the Management Controller requires routes

* The `kubectl` command-line tool, version 1.15 or later
  ([installation guide][install-kubectl]).

  [kube-providers]: https://skupper.io/start/kubernetes.html
  [install-kubectl]: https://kubernetes.io/docs/tasks/tools/install-kubectl/

* cert-manager installed on the cluster you are running the management server from

    ~~~ shell
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.19.2/cert-manager.yaml
    ~~~

    You can get the most recent version from https://cert-manager.io/docs/installation/kubectl/

    **NOTE:** cert-manager is included in OpenShift


## Part 1: Set up the management server

### Step 1: Access your Kubernetes cluster

Open a new terminal window and run the following commands:

~~~ shell
export KUBECONFIG=~/.kube/management-server
<provider-specific login command>
~~~

**Note:** The login procedure varies by provider

### Step 2: Create your Kubernetes namespace for the management server to run in

**Note:** This must be done on an OpenShift cluster as the Management Controller requires routes

~~~ shell
kubectl create namespace vms
kubectl config set-context --current --namespace vms
~~~

### Step 3: Set up postgres database and root certificate authority in the namespace

Apply the following yaml files found in the /yaml folder in the root of the repo.

#### On OpenShift

**Note:** Paths relative to repository root

Get the default storage class from your cluster

~~~ shell
export STORAGE_CLASS=$(kubectl get storageclasses.storage.k8s.io -o json | jq -r '.items[] | select(.metadata.annotations."storageclass.kubernetes.io/is-default-class" == "true") | .metadata.name')
~~~

Update the `storageClassName` on `yaml/openshift-postgres.yaml` and `yaml/postgres-pvc-pv.yaml` files, using:

~~~ shell
sed -i "s/storageClassName: .*/storageClassName: ${STORAGE_CLASS:?}/g" yaml/openshift-postgres.yaml yaml/postgres-pvc-pv.yaml
~~~

Now you can proceed and apply the following yamls on OpenShift.

~~~ shell
kubectl -n vms apply -f yaml/postgres-config.yaml
kubectl -n vms apply -f yaml/postgres-pvc-pv.yaml
kubectl -n vms apply -f yaml/openshift-postgres.yaml
kubectl -n vms apply -f yaml/root-ca.yaml
~~~

#### On Kubernetes

~~~ shell
kubectl apply -f yaml/postgres-config.yaml
kubectl apply -f yaml/postgres-deployment.yaml
kubectl apply -f yaml/postgres-pvc-pv.yaml
kubectl apply -f yaml/postgres-service.yaml
kubectl apply -f yaml/root-ca.yaml
~~~

### Step 4: Install Node packages

From the root of the repo, run the following command to install the necessary Node packages. Then, navigate to the management-controller directory.

~~~ shell
pnpm install
cd ./components/management-controller
~~~

**Note:** It is required to use pnpm, not npm, as the package manager for the install.

### Step 5: Set environment variables

~~~ shell
export PGUSER=access
export PGPASSWORD=password
export PGDATABASE=studiodb
export SKX_STANDALONE_NAMESPACE=vms
~~~

To set the PGHOST environment variable, run the following command to find the cluster IP of the postgres service (if you are not using OpenShift).

~~~ shell
export PGHOST=$(kubectl -n vms get svc postgres -o json | jq -r .spec.clusterIP)
~~~

### Step 6: Set up the database schema

To set up the postgres database schema, run the following command against the postgres pod to execute the database setup script found in ./scripts from the root of the repo.

#### On OpenShift

~~~ shell
kubectl -n vms exec -it statefulsets/postgres -- psql -U $PGUSER -d $PGDATABASE < ./scripts/db-setup.sql
~~~

#### On Kubernetes

~~~ shell
kubectl exec -it deployment/postgres -- psql -U $PGUSER -d $PGDATABASE < ./scripts/db-setup.sql
~~~

**NOTE:** If using minikube, run `minikube tunnel` in a separate terminal.

### Step 7: Start the server (for local development)

From inside the management-controller directory, run:

> **Note:** If you are on OpenShift, you can port-forward localhost port 5432 to your pod/postgres-0 and set `PGHOST=localhost`.

~~~ shell
# under components/management-controller, run:
node index.js
~~~

## Part 2: Setting up the backbone on a Kubernetes cluster

### Step 1: Access your Kubernetes cluster

Open a new terminal window and run the following commands:

~~~ shell
export KUBECONFIG=~/.kube/backbone
<provider-specific login command>
~~~

### Step 2: Create a namespace for your backbone to run on

~~~ shell
kubectl create namespace <backbone-namespace>
kubectl config set-context --current --namespace <backbone-namespace>
~~~

### Step 3: Create a backbone network and site in the vms console

1. Navigate to http://localhost:8085 and open the "backbones" tab
2. Create a new backbone and give it a name
3. Click on the newly created backbone and click the "Activate" button
4. Click "Create site...", give it a name, and select "skx-prototype" as the target platform
5. Create an access point on the newly created site with kind: "manage"
6. Create a second access point with kind: "van"
7. Click the "Bootstrap Step 1" download link and apply the downloaded yaml in your backbone namespace
8. Run `kubectl exec -it <vms-site-pod> -c controller -- skxhosts`
9. Copy the output ingress data into the "Upload ingress data" section in the vms console under "Bootstrap Step 2"
10. Once the host and port data appear on the "manage" access point, click the "Bootstrap Step 3" download link and apply the downloaded yaml file in your backbone namespace

## Part 3: Connecting a van to the management backbone

### Step 1: Access your Kubernetes cluster

Open a new terminal window and run the following commands:

~~~ shell
export KUBECONFIG=~/.kube/van
<provider-specific login command>
~~~

**Note:** The login procedure varies by provider

### Step 2: Set up the skupper-controller with multi-van crds and images

1. Apply the following crds to your cluster:

    ~~~ shell
    kubectl apply -f https://github.com/fgiorgetti/skupper/raw/refs/heads/multi-van/config/crd/bases/skupper_network_crd.yaml
    kubectl apply -f https://github.com/fgiorgetti/skupper/raw/refs/heads/multi-van/config/crd/bases/skupper_network_link_crd.yaml
    kubectl apply -f https://github.com/fgiorgetti/skupper/raw/refs/heads/multi-van/config/crd/bases/skupper_inter_network_ingress_crd.yaml
    kubectl apply -f https://github.com/fgiorgetti/skupper/raw/refs/heads/multi-van/config/crd/bases/skupper_network_access_crd.yaml
    kubectl apply -f https://github.com/fgiorgetti/skupper/raw/refs/heads/multi-van/config/crd/bases/skupper_certificate_request_crd.yaml
    ~~~

2. Change the skupper-controller deployment to use multi-van images

    a. Run `kubectl edit deployment skupper-controller -n skupper`
    b. Swap the kube-adaptor, skupper-router, and controller images for the following:

    * quay.io/fgiorgetti/kube-adaptor:multi-van
    * quay.io/tedlross/skupper-router:multi-van
    * quay.io/fgiorgetti/controller:multi-van

3. Run `kubectl edit clusterrole skupper-controller -n skupper` and add the following to the skupper.io apiGroups section

    * networks
    * networks/status
    * internetworkingresses
    * internetworkingresses/status
    * networklinks
    * networklinks/status
    * networkaccesses
    * networkaccesses/status
    * certificaterequests
    * certificaterequests/status

### Step 3: Create your Kubernetes namespace for the van to run in

~~~ shell
kubectl create namespace van
kubectl config set-context --current --namespace van
~~~

### Step 4: Create a skupper site in the van namespace

~~~ shell
skupper site create van-site
~~~

### Step 5: Create the van in the vms console

1. In the console, navigate to the "VANs" tab and click "Create Externally-Created VAN..."
2. Give it a name and click "Submit"
3. Click on the newly created van and navigate to the "Configuration" tab
4. Select the configuration type of "VAN Site Connected to the Management Backbone" and select the backbone we created in the previous steps from the dropdown
5. Click the "download configuration" button and apply the downloaded yaml in the van namespace

## Part 4: Confirm everything is set up properly

In order to check that the van and backbone are connected and communicating, run the following command in the backbone terminal:

~~~ shell
kubectl get routes
~~~

There should be two active routes, one for the "manage" access point and another for the "van" access point