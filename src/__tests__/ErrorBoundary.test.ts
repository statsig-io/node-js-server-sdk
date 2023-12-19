import { AdapterResponse, IDataAdapter } from 'statsig-node';
import ErrorBoundary, { ExceptionEndpoint } from '../ErrorBoundary';
import {
  StatsigInvalidArgumentError,
  StatsigTooManyRequestsError,
  StatsigUninitializedError,
} from '../Errors';
import { InitStrategy, OptionsLoggingCopy } from '../StatsigOptions';
import { getStatsigMetadata } from '../utils/core';
import { getDecodedBody } from './StatsigTestUtils';
jest.mock('node-fetch', () => jest.fn());
const TestDataAdapter: IDataAdapter = {
  get(key: string): Promise<AdapterResponse> {
    return new Promise<AdapterResponse>(() => {})
  },
  set(key: string, value: string, time?: number): Promise<void> {
    return new Promise(() => {})
  },
  shutdown(): Promise<void> {
    return new Promise(() => {})

  },
  initialize(): Promise<void>{
    return new Promise(() => {})
  }
}
describe('ErrorBoundary', () => {
  let boundary: ErrorBoundary;
  let requests: { url: RequestInfo; params: RequestInit }[] = [];

  beforeEach(() => {
    const options = {
      environment: {tier: "staging"},
      initStrategyForIP3Country: 'await' as InitStrategy,
      rulesetsSyncIntervalMs: 30000,
      dataAdapter: TestDataAdapter,
      api: "www.google.com",
      disableDiagnostics: true
    }
    boundary = new ErrorBoundary('secret-key', OptionsLoggingCopy(options), 'sessionID');
    requests = [];

    const fetch = require('node-fetch');
    fetch.mockImplementation((url: RequestInfo, params: RequestInit) => {
      requests.push({ url: url.toString(), params });
      return Promise.resolve();
    });
  });

  it('recovers from error and returns result', () => {
    let called = false;
    const result = boundary.capture(
      () => {
        throw new URIError();
      },
      () => {
        called = true;
        return 'called';
      },
    );

    expect(called).toBe(true);
    expect(result).toEqual('called');
  });

  it('recovers from error and returns result', async () => {
    const result = await boundary.capture(
      () => Promise.reject(Error('bad')),
      () => Promise.resolve('good'),
    );

    expect(result).toEqual('good');
  });

  it('returns successful results when there is no crash', async () => {
    const result = await boundary.capture(
      () => Promise.resolve('success'),
      () => Promise.resolve('failure'),
    );

    expect(result).toEqual('success');
  });

  it('logs errors correctly', () => {
    const err = new URIError();
    boundary.swallow(() => {
      throw err;
    });

    expect(requests[0].url).toEqual(ExceptionEndpoint);

    expect(getDecodedBody(requests[0].params)).toEqual(
      expect.objectContaining({
        exception: 'URIError',
        info: err.stack,
      }),
    );
  });

  it('logs error-ish correctly', () => {
    const err = { 'sort-of-an-error': 'but-not-really' };
    boundary.swallow(() => {
      throw err;
    });

    expect(requests[0].url).toEqual(ExceptionEndpoint);
    expect(getDecodedBody(requests[0].params)).toEqual(
      expect.objectContaining({
        exception: 'No Name',
        info: JSON.stringify(err),
      }),
    );
  });

  it('logs the correct headers', () => {
    boundary.swallow(() => {
      throw new Error();
    });

    const metadata = getStatsigMetadata();
    expect(requests[0].params['headers']).toEqual(
      expect.objectContaining({
        'STATSIG-API-KEY': 'secret-key',
        'STATSIG-SDK-TYPE': metadata.sdkType,
        'STATSIG-SDK-VERSION': metadata.sdkVersion,
        'Content-Type': 'application/json',
      }),
    );
  });

  it('logs statsig metadata and options', () => {
    boundary.swallow(() => {
      throw new Error();
    });

    expect(getDecodedBody(requests[0].params)).toEqual(
      expect.objectContaining({
        statsigMetadata: {...getStatsigMetadata(), sessionID: "sessionID"},
      }),
    );

    expect(getDecodedBody(requests[0].params)).toEqual(
      expect.objectContaining({
        statsigOptions: {
          environment: {tier: "staging"},
          initStrategyForIP3Country: 'await',
          rulesetsSyncIntervalMs: 30000,
          dataAdapter: "set",
          api: "www.google.com",
          disableDiagnostics: true
        },
      }),
    );
  });

  it('logs the same error only once', () => {
    boundary.swallow(() => {
      throw new Error();
    });

    expect(requests.length).toEqual(1);

    boundary.swallow(() => {
      throw new Error();
    });

    expect(requests.length).toEqual(1);
  });

  it('does not catch intended errors', () => {
    expect(() => {
      boundary.swallow(() => {
        throw new StatsigUninitializedError();
      });
    }).toThrow('Call and wait for initialize() to finish first.');

    expect(() => {
      boundary.swallow(() => {
        throw new StatsigInvalidArgumentError('bad arg');
      });
    }).toThrow('bad arg');

    expect(() => {
      boundary.swallow(() => {
        throw new StatsigTooManyRequestsError('slow down');
      });
    }).toThrow('slow down');
  });
});
