# Turbonomic Container Actions

Get all Kubernetes groups, their containers, and their associated actions from Turbonomic.

## Configuration

All configuration is exposed via the following required environment variables:

| Environment Variable  | Type        | Description                                         | Example Value         |
|-----------------------|-------------|-----------------------------------------------------|-----------------------|
| TURBO_USERNAME        | String      | Username for authenticating to the Turbonomic API   | `username`
| TURBO_PASSWORD        | String      | Password for authenticating to the Turbonomic API   | `password`
| TURBO_URL             | String      | URL of the Turbonomic API                           | `https://10.0.10.0`
| POD_SEARCH_QUERY      | JSON string | Query to find the pods you're interested in         | `{"types":"Group","q":"Pods By"}`
| POD_ACTIONS_QUERY     | JSON string | Query to find the actions you're interested in      | `{"actionTypeList":["RESIZE","RIGHT_SIZE","SCALE"],"environmentType":"HYBRID","detailLevel":"EXECUTION"}`
| POD_GROUPS_TO_EXCLUDE | JSON string | Array of groups to ignore                           | `["All Daemonsets"]`

Optional configuration is available as environment variables as well:

| Environment Variable  | Type        | Description                   | Default Value         |
|-----------------------|-------------|-------------------------------|-----------------------|
| OUTPUT_FILENAME       | String      | Filename to save results as   | `pod_groups.json`
| DEBUG                 | String      | Enable debug messages         | n/a

Additionally, if you have not properly configured HTTPS on your Turbonomic server (i.e. using a self-signed cert) you may want to consider setting `NODE_TLS_REJECT_UNAUTHORIZED` to `'0'` until you've fixed your security.

## Running

First, add all environment variables to your terminal session.

`$ source config.env`

Next, install prerequisites:

`$ npm install`

Finally, it's time to let 'er rip:

`$ npm start`