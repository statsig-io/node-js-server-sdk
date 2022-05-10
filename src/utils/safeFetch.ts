let nodeFetch = null;
try {
  nodeFetch = require('node-fetch');
} catch (err) {
  // Ignore
}

export default function safeFetch(...args) {
  
  if (nodeFetch) {
    return nodeFetch(...args);
  } else {
    // @ts-ignore
    return fetch(...args);
  }
}
