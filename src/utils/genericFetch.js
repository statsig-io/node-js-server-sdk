let nodeFetch = null;
try {
  nodeFetch = require('node-fetch');
} catch(err) {
  // Ignore
}

function genericFetch(...args) {
  if (nodeFetch) {
    return nodeFetch(...args);
  } else {
    // @ts-ignore
    return fetch(...args);
  }
}

module.exports = genericFetch;