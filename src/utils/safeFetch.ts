import { GlobalContext } from './StatsigContext';

// @ts-ignore
let nodeFetch: (...args) => Promise<Response> = null;
// @ts-ignore
if (!GlobalContext.isEdgeEnvironment) {
  try {
    nodeFetch = require('node-fetch');
    const nfDefault = (nodeFetch as any).default;
    if (nfDefault && typeof nfDefault === 'function') {
      nodeFetch = nfDefault;
    }
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
