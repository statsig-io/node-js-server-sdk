// @ts-ignore
let nodeFetch: (...args) => Promise<Response> = null;
// @ts-ignore
if (typeof EdgeRuntime !== 'string') {
  try {
    // 5.4.1-beta.0 specific for compatibility with module-only bundling
    nodeFetch = require('node-fetch').default;
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
