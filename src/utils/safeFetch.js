let nodeFetch = null;
try {
  nodeFetch = require('node-fetch');
} catch(err) {
  // Ignore
}

function safeFetch(...args) {
  if (nodeFetch) {
    return nodeFetch(...args);
  } else {
    // @ts-ignore
    return fetch(...args);
  }
}

module.exports = safeFetch; 