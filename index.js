const fs = require('fs');
const axios = require('axios');
const qs = require('querystring');
const asyncPool = require('tiny-async-pool');

let turboCookie;
const formatTurboAuthHeader = () => ({ Cookie: turboCookie });

/** Retrieve and store an authorization cookie from the Turbonomic API */
async function setCookie() {
  const loginEndpoint = `${process.env.TURBO_URL}/vmturbo/rest/login`;
  const requestBody = {
    username: process.env.TURBO_USERNAME,
    password: process.env.TURBO_PASSWORD,
  };
  try {
    const response = await axios.post(loginEndpoint, qs.stringify(requestBody));
    [turboCookie] = response.headers['set-cookie'];
  } catch (err) {
    throw new Error(`Error authenticating to Turbonomic: ${err.message}`);
  }
}

/** Output a message to the console if the DEBUG environment variable is set to true */
async function debug(msg) {
  if (process.env.DEBUG) {
    console.log(msg);
  }
}

/**
 * Map remaining cursors to a function to enable asynchronous records requests
 * @param {Number} cursor Current record cursor
 * @param {Number} totalRecords Total number of records to retrieve
 * @param {Function} fn Function to map the cursors to
 */
function mapCursors(cursor, totalRecords, fn) {
  // Number of records that will be returned from Turbonomic per request
  const turboRecordsLimit = 500;

  const remainingRecords = totalRecords - cursor;
  const numRequests = Math.ceil(remainingRecords / turboRecordsLimit);
  const cursors = [];
  for (let i = 1; i <= numRequests; i++) {
    cursors.push(i * turboRecordsLimit);
  }
  return cursors.map(fn);
}

/**
 * Get all actions for the Turbonomic "Market" market
 * @param {Object} body Body of the request (by default, get actions for ContainerPods)
 */
async function getActions(body = { relatedEntityTypes: ['ContainerSpec'] }) {
  const actionsEndpoint = `${process.env.TURBO_URL}/api/v3/markets/Market/actions`;
  const postConfig = {
    headers: {
      ...formatTurboAuthHeader(),
      'Content-Type': 'application/json',
    },
  };

  try {
    const response = await axios.post(actionsEndpoint, body, postConfig);
    const { headers } = response;
    let { data: actions } = response;

    debug(`Total Action Record Count: ${Number(headers['x-total-record-count'])}`);

    let cursor;
    if (!headers['x-next-cursor'] || headers['x-next-cursor'] === '') {
      cursor = -1;
    } else {
      cursor = Number(headers['x-next-cursor']);
    }

    // Fetch additional actions asynchronously
    if (cursor !== -1) {
      const totalRecords = Number(headers['x-total-record-count']);
      const results = await Promise.all(mapCursors(cursor, totalRecords, async (c) => {
        const { data } = await axios.post(`${actionsEndpoint}?cursor=${c}`, body, postConfig);
        return data;
      }));
      actions = actions.concat(results.flat());
    }

    debug(`Actions Recieved: ${actions.length}`);

    return actions;
  } catch (err) {
    throw new Error(`Error retrieving actions from Turbonomic: ${err.message}`);
  }
}

/** Execute a search against the Turbonomic search API */
/**
 * Search for entities with the Turbonomic API
 * @param {Object} params Query parameters for the search
 * @param {Function} filterFn Function to use as a filter function on the results (optional)
 */
async function search(params, filterFn) {
  const searchEndpoint = `${process.env.TURBO_URL}/api/v3/search`;
  const filter = typeof filterFn === 'function';

  try {
    const { headers, data: results } = await axios.get(searchEndpoint, {
      params,
      headers: formatTurboAuthHeader(),
    });
    let searchResults = filter ? results.filter(filterFn) : results;

    debug(`Total Action Record Count: ${Number(headers['x-total-record-count'])}`);

    let cursor;
    if (!headers['x-next-cursor'] || headers['x-next-cursor'] === '') {
      cursor = -1;
    } else {
      cursor = Number(headers['x-next-cursor']);
    }

    // Fetch additional actions asynchronously
    if (cursor !== -1) {
      const totalRecords = Number(headers['x-total-record-count']);
      const allResults = await Promise.all(mapCursors(cursor, totalRecords, async (c) => {
        const { data } = await axios.get(`${searchEndpoint}?cursor=${c}`, { params, headers: formatTurboAuthHeader() });
        return data;
      }));
      searchResults = searchResults.concat(allResults.flat());
    }

    debug(`Received ${searchResults.length}${filter ? ' filtered' : ''} search results.`);

    return searchResults;
  } catch (err) {
    throw new Error(`Error retrieving search results from Turbonomic: ${err.message}`);
  }
}

/**
 * Get containers for a pod group
 * @param {Array} uuidList List of Turbonomic UUIDs to get containers for
 */
async function getContainersFromPod(uuidList) {
  const supplychainEndpoint = `${process.env.TURBO_URL}/api/v3/supplychains`;
  try {
    const params = new URLSearchParams();
    params.append('types', 'ContainerSpec');
    params.append('detail_type', 'entity');
    params.append('health', false);
    uuidList.forEach((uuid) => {
      params.append('uuids', uuid);
    });

    const { data: supplychains } = await axios.get(supplychainEndpoint, {
      params,
      headers: formatTurboAuthHeader(),
    });
    const mappedItems = [];
    if (!supplychains.seMap
      || !supplychains.seMap.ContainerSpec
      || !supplychains.seMap.ContainerSpec.instances) {
      return [];
    }
    for (const [key, value] of Object.entries(supplychains.seMap.ContainerSpec.instances)) {
      mappedItems.push({
        uuid: key,
        displayName: value.displayName,
      });
    }
    return mappedItems;
  } catch (err) {
    throw new Error(`Error getting containers from pod from Turbonomic: ${err.message}`);
  }
}

// Correlate actions with a group
/**
 * Correlate actions with a pod group
 * @param {Object} group Pod group to get actions for
 * @param {Array} actions List of all available actions
 */
function correlateActions(group, actions) {
  // Object to return at the end
  const groupWithActions = {
    ...group,
    actionsDescription: '',
    actions: [],
  };

  // Loop through the containers in the group and get actions for them
  group.container_members.forEach((container) => {
    actions.filter((action) => container.uuid === action.target.uuid).forEach((action) => {
      action.compoundActions.forEach((ca) => {
        const { actionType } = ca;
        const containerName = ca.target.displayName;
        const commodity = ca.risk.reasonCommodity;
        groupWithActions.actions.push({
          container_name: containerName,
          action_type: actionType,
          commodity,
          current_value: ca.current_value,
          resizeToValue: ca.resizeToValue,
          valueUnits: ca.valueUnits,
        });
        groupWithActions.actionsDescription = `${action.risk.subCategory}: ${action.risk.description}`;
      });
    });
  });

  return groupWithActions;
}

/**
 * Return whether or not a pod group should be excluded
 * @param {Array<String>} excludeGroups Groups that should not be included
 * @param {Object} element Pod group to check
 */
function excludeGroupsFromResults(excludeGroups, element) {
  return !(excludeGroups.some((group) => element.displayName.includes(group)));
}

/**
 * Convert Turbonomicese to Kubernetese, fetching containers along the way
 * @param {Object} pod Pod to parse
 */
async function parsePodsFromGroup(group) {
  const groupUUID = group.uuid;
  const tempParse = group.displayName.replace(' Pods', '').split('/');
  const resourceType = tempParse[0];
  const resourceNamespace = tempParse[1];
  const resourceName = tempParse[2];
  const kubeCluster = group.source.displayName;

  const containerMembers = await getContainersFromPod(group.memberUuidList);
  return {
    group_uuid: groupUUID,
    resource_type: resourceType,
    resource_name: resourceName,
    resource_namespace: resourceNamespace,
    cluster: kubeCluster,
    container_members: containerMembers,
  };
}

/**
 * Get all containers and their associated actions from Turbonomic
 */
async function getContainersAndActions() {
  // Set Turbonomic auth cookie
  await setCookie();

  // What to query the search endpoint for in order to retrieve a list of pod groups
  const podSearchQuery = JSON.parse(process.env.POD_SEARCH_QUERY);

  // Groups to exclude from search:
  const excludeGroups = JSON.parse(process.env.POD_GROUPS_TO_EXCLUDE);

  // Fetch actions from the Turbonomic API
  const actions = await getActions();

  // Fetch pod groups from the Turbonomic API
  const podGroups = await search(podSearchQuery, excludeGroupsFromResults.bind(null, excludeGroups));

  // Parse each pod group
  const parsedGroups = [];
  const simultaneousRequestLimit = 25;
  await asyncPool(simultaneousRequestLimit, podGroups, async (group) => {
    parsedGroups.push(await parsePodsFromGroup(group));
  });

  // Combine pod groups with their actions
  parsedGroups.forEach((group, idx) => {
    parsedGroups[idx] = correlateActions(group, actions);
  });

  const results = parsedGroups.filter((x) => x.actions.length > 0);

  fs.writeFileSync(
    (process.env.OUTPUT_FILENAME && process.env.OUTPUT_FILENAME !== '') ? process.env.OUTPUT_FILENAME : 'container-actions.json',
    JSON.stringify(results, null, 2),
  );
}

/**
 * Make sure all the required environment variables are present
 */
function checkEnvironmentVariables() {
  const requiredVariables = [
    'TURBO_USERNAME', 'TURBO_PASSWORD', 'TURBO_URL', 'POD_SEARCH_QUERY', 'POD_GROUPS_TO_EXCLUDE',
  ];
  const missingVariables = requiredVariables.filter((v) => !process.env[v]);
  if (missingVariables.length > 0) {
    console.error(`Error - The following required environment variables were missing: ${missingVariables.join(', ')}`);
    process.exit(1);
  }

  try {
    JSON.parse(process.env.POD_SEARCH_QUERY);
  } catch (err) {
    console.error('Error - POD_SEARCH_QUERY should be a valid JSON string.');
    process.exit(1);
  }

  try {
    JSON.parse(process.env.POD_GROUPS_TO_EXCLUDE);
  } catch (err) {
    console.error('Error - POD_GROUPS_TO_EXCLUDE should be a valid JSON string.');
    process.exit(1);
  }
}

checkEnvironmentVariables();

getContainersAndActions();
