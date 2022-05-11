let nodeFetch = null;
try {
  var webpackBypass = '';
  nodeFetch = require(`node-fetch${webpackBypass}`);
} catch (err) {
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