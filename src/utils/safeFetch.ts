import { GlobalContext } from './StatsigContext';

// @ts-ignore
let fetchImpl: ((...args) => Promise<Response>) | null = null;

// Check if native fetch is available (Node 18+, browsers, edge runtimes)
// @ts-ignore
if (typeof fetch === 'function') {
  // @ts-ignore
  fetchImpl = fetch;
}

// Only fall back to node-fetch if native fetch is not available
// and we're not in an edge environment
// @ts-ignore
if (!fetchImpl && !GlobalContext.isEdgeEnvironment) {
  try {
    const nodeFetch = require('node-fetch');
    const nfDefault = (nodeFetch as any).default;
    if (nfDefault && typeof nfDefault === 'function') {
      fetchImpl = nfDefault;
    } else {
      fetchImpl = nodeFetch;
    }
  } catch (err) {
    // Ignore - fetch might be provided by the runtime
  }
}

// @ts-ignore
export default function safeFetch(...args): Promise<Response> {
  if (fetchImpl) {
    return fetchImpl(...args);
  }
  // Last resort: try global fetch (might throw if not available)
  // @ts-ignore
  return fetch(...args);
}
