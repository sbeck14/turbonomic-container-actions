# Turbonomic Container Actions

Get all Kubernetes groups, their containers, and their associated actions from Turbonomic.

## Configuration

All configuration is exposed via the following required environment variables:

| Environment Variable  | Type        | Description                                         | Example Value         |
|-----------------------|-------------|-----------------------------------------------------|-----------------------|
| TURBO_USERNAME        | String      | Username for authenticating to the Turbonomic API   | `username`
| TURBO_PASSWORD        | String      | Password for authenticating to the Turbonomic API   | `password`
| TURBO_URL             | String      | URL of the Turbonomic API                           | `https://10.0.10.0`
| POD_SEARCH_QUERY      | JSON string | Query to find the pods you're interested in         | `{"types":"Group","group_type":"ContainerPod"}`
| POD_GROUPS_TO_EXCLUDE | JSON string | Array of groups to ignore                           | `["All Daemonsets"]`

Optional configuration is available as environment variables as well:

| Environment Variable  | Type        | Description                   | Default Value         |
|-----------------------|-------------|-------------------------------|-----------------------|
| OUTPUT_FILENAME       | String      | Filename to save results as   | `container-actions.json`
| DEBUG                 | String      | Enable debug messages         | n/a

Additionally, if you have not properly configured HTTPS on your Turbonomic server (i.e. using a self-signed cert) you may want to consider setting `NODE_TLS_REJECT_UNAUTHORIZED` to `'0'` until you've fixed your security.

## Running

First, add all environment variables to your terminal session.

`$ source config.env`

Next, install prerequisites:

`$ npm install`

Finally, it's time to let 'er rip:

`$ npm start`

A list of actionable resources will be output to a file when the script is complete.

### Example Output

```json
[
  {
    "group_uuid": "284932924910320",
    "resource_type": "Deployment",
    "resource_name": "workplaceaddin",
    "resource_namespace": "perf-qa",
    "cluster": "Kubernetes-ds1",
    "container_members": [
      {
        "uuid": "73543504474528",
        "displayName": "workplaceaddin"
      }
    ],
    "actionsDescription": "Efficiency Improvement: Container Resize - Resize DOWN VMem Request from 768 MB to 256 MB, Resize DOWN VMem Limit from 1 GB to 768 MB in Container Spec workplaceaddin",
    "actions": [
      {
        "container_name": "workplaceaddin",
        "action_type": "RESIZE",
        "commodity": "VMemRequest",
        "resizeToValue": "262144.0",
        "valueUnits": "KB"
      },
      {
        "container_name": "workplaceaddin",
        "action_type": "RESIZE",
        "commodity": "VMem",
        "resizeToValue": "786432.0",
        "valueUnits": "KB"
      }
    ]
  }
]
```