import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import exampleConfigSpecs from './jest.setup';

jest.mock('../utils/safeFetch', () => jest.fn());

const jsonResponse = {
  time: Date.now(),
  feature_gates: [exampleConfigSpecs.gate, exampleConfigSpecs.disabled_gate],
  dynamic_configs: [exampleConfigSpecs.config],
  layer_configs: [],
  id_lists: {},
  has_updates: true,
};

describe('CDN Retry Test', () => {
  const fetch = require('../utils/safeFetch');
  const proxyBaseUrl = 'https://proxy.example.com';
  let requestCount = 0;
  let proxyRequestCount = 0;
  let cdnRequestCount = 0;

  beforeEach(() => {
    StatsigInstanceUtils.setInstance(null);
    fetch.mockClear();
    requestCount = 0;
    proxyRequestCount = 0;
    cdnRequestCount = 0;
  });

  afterEach(async () => {
    await Statsig.shutdownAsync();
  });

  it('falls back to CDN when proxy request throws an exception', async () => {
    fetch.mockImplementation((url: string, _params: any) => {
      if (url.includes('download_config_specs')) {
        requestCount++;
  
        if (url.startsWith(proxyBaseUrl)) {
          proxyRequestCount++;
          // Simulate network error like ECONNREFUSED, DNS failure, etc.
          return Promise.reject(new Error('Simulated network failure'));
        }
  
        if (url.includes('api.statsigcdn.com')) {
          cdnRequestCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(jsonResponse),
            text: () => Promise.resolve(JSON.stringify(jsonResponse)),
          });
        }
      }
  
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    });
  
    await Statsig.initialize('secret-key', {
      apiForDownloadConfigSpecs: `${proxyBaseUrl}/v1`,
      apiForGetIdLists: `${proxyBaseUrl}/v1`,
      fallbackToStatsigAPI: true,
    });
  
    expect(proxyRequestCount).toBe(1);
    expect(cdnRequestCount).toBe(1);
    expect(requestCount).toBe(2);

    const result = Statsig.getFeatureGate(
      { userID: 'test_user', email: 'aaron@packers.com' },
      'nfl_gate'
    );
    expect(result.value).toBe(true);
    expect(result.ruleID).toBe('rule_id_gate');
  });  

  it('falls back to CDN when proxy returns status code 0', async () => {
    fetch.mockImplementation((url: string, _params: any) => {
      if (url.includes('download_config_specs')) {
        requestCount++;

        if (url.startsWith(proxyBaseUrl)) {
          proxyRequestCount++;
          return Promise.resolve({
            ok: false,
            status: 0,
            text: () => Promise.resolve('Unknown status'),
            json: () => Promise.resolve({}),
          });
        }

        if (url.includes('api.statsigcdn.com')) {
          cdnRequestCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(jsonResponse),
            text: () => Promise.resolve(JSON.stringify(jsonResponse)),
          });
        }
      }

      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    });

    await Statsig.initialize('secret-key', {
      apiForDownloadConfigSpecs: `${proxyBaseUrl}/v1`,
      apiForGetIdLists: `${proxyBaseUrl}/v1`,
      fallbackToStatsigAPI: true,
    });

    expect(proxyRequestCount).toBe(1);
    expect(cdnRequestCount).toBe(1);
    expect(requestCount).toBe(2);

    const result = Statsig.getFeatureGate(
      { userID: 'test_user', email: 'aaron@packers.com' },
      'nfl_gate'
    );
    expect(result.value).toBe(true);
    expect(result.ruleID).toBe('rule_id_gate');
  });

  it('should fallback to CDN when proxy request fails', async () => {
    fetch.mockImplementation((url: string, params) => {
      if (url.includes('download_config_specs')) {
        requestCount++;
        
        if (url.startsWith(proxyBaseUrl)) {
          proxyRequestCount++;
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve('Internal Server Error'),
          });
        } else if (url.includes('api.statsigcdn.com')) {
          cdnRequestCount++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(jsonResponse),
            text: () => Promise.resolve(JSON.stringify(jsonResponse)),
            status: 200,
          });
        }
      }

      if (url.includes('get_id_lists')) {
        if (url.startsWith(proxyBaseUrl)) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve('Internal Server Error'),
          });
        } else if (url.includes('statsigapi.net')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
            status: 200,
          });
        }
      }

      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });

    await Statsig.initialize('secret-key', {
      apiForDownloadConfigSpecs: `${proxyBaseUrl}/v1`,
      apiForGetIdLists: `${proxyBaseUrl}/v1`,
      fallbackToStatsigAPI: true,
    });

    expect(proxyRequestCount).toBe(1);
    expect(cdnRequestCount).toBe(1);
    expect(requestCount).toBe(2);
    
    expect(Statsig.checkGate({ userID: 'test_user' }, 'test_gate')).toBeDefined();
    const result = Statsig.getFeatureGate(
      { userID: 'test_user', email: 'aaron@packers.com' },
      'nfl_gate'
    );
    expect(result.value).toBe(true);
    expect(result.ruleID).toBe('rule_id_gate');
    
    const downloadConfigSpecsCalls = fetch.mock.calls.filter(call => 
      call[0].includes('download_config_specs')
    );
    expect(downloadConfigSpecsCalls).toHaveLength(2);
    
    expect(downloadConfigSpecsCalls[0][0]).toContain(proxyBaseUrl);
    expect(downloadConfigSpecsCalls[1][0]).toContain('api.statsigcdn.com');
  });
});
