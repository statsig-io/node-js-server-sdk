// @ts-ignore
let nodeFetch: (...args) => Promise<Response> = null;
try {
  nodeFetch = require('node-fetch');
} catch (err) {
  // Ignore
}

// @ts-ignore
export default function safeFetch(...args): Promise<Response> {
  if (nodeFetch) {
    return nodeFetch(...args);
  } else {
    return fetch(...args);
  }
}
