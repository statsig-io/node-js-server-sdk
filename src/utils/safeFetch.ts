// @ts-ignore
let nodeFetch: (...args) => Promise<Response> = null;
// @ts-ignore
if (typeof EdgeRuntime !== 'string') {
  try {
    nodeFetch = require('node-fetch');
  } catch (err) {
    // Ignore
  }
}

// @ts-ignore
export default function safeFetch(...args): Promise<Response> {
  if (nodeFetch) {
    return nodeFetch(...args);
  } else {
    // @ts-ignore
    return fetch(...args);
  }
}
