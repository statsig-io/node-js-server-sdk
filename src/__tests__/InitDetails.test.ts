import {
  StatsigInitializeFromNetworkError,
  StatsigInvalidBootstrapValuesError,
  StatsigInvalidDataAdapterValuesError,
} from '../Errors';
import { DataAdapterKey } from '../interfaces/IDataAdapter';
import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import TestDataAdapter from './TestDataAdapter';
import SpecStore from '../SpecStore';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/eval_details_download_config_specs.json'),
);

describe('InitDetails', () => {
  const network500Error = new Error(
    'Request to https://api.statsigcdn.com/v1/download_config_specs/secret-key.json?sinceTime=0 failed with status 500',
  );
  let dcsStatus: number = 200;

  beforeEach(async () => {
    const fetch = require('node-fetch');

    fetch.mockImplementation((url: string) => {
      if (url.includes('download_config_specs')) {
        return new Promise((res) => {
          setTimeout(
            () =>
              res({
                ok: dcsStatus >= 200 && dcsStatus < 300,
                text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
                status: dcsStatus,
              }),
            100,
          );
        });
      }

      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });
  });

  afterEach(() => {
    StatsigInstanceUtils.setInstance(null);
    dcsStatus = 200;
  });

  it('Network - success', async () => {
    const res = await Statsig.initialize('secret-key');

    expect(res.success).toEqual(true);
    expect(res.error).toBeUndefined();
    expect(res.source).toEqual('Network');
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Network - failure', async () => {
    dcsStatus = 500;
    const res = await Statsig.initialize('secret-key');

    expect(res.success).toEqual(false);
    expect(res.error).toEqual(
      new StatsigInitializeFromNetworkError(network500Error),
    );
    expect(res.source).toBeUndefined();
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Network - timeout', async () => {
    const res = await Statsig.initialize('secret-key', { initTimeoutMs: 1 });

    expect(res.success).toEqual(false);
    expect(res.error).toEqual(new Error('Timed out waiting for initialize'));
    expect(res.source).toBeUndefined();
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Bootstrap - success', async () => {
    const res = await Statsig.initialize('secret-key', {
      bootstrapValues: CONFIG_SPEC_RESPONSE,
    });

    expect(res.success).toEqual(true);
    expect(res.error).toBeUndefined();
    expect(res.source).toEqual('Bootstrap');
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Bootstrap - failure (fallback to network success)', async () => {
    const res = await Statsig.initialize('secret-key', {
      bootstrapValues: '',
    });

    expect(res.success).toEqual(true);
    expect(res.error).toEqual(new StatsigInvalidBootstrapValuesError());
    expect(res.source).toEqual('Network');
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Bootstrap - failure (fallback to network failure)', async () => {
    dcsStatus = 500;
    const res = await Statsig.initialize('secret-key', {
      bootstrapValues: '',
    });

    expect(res.success).toEqual(false);
    expect(res.error).toEqual(
      new StatsigInitializeFromNetworkError(network500Error),
    );
    expect(res.source).toBeUndefined();
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Data Adapter - success', async () => {
    const dataAdapter = new TestDataAdapter();
    await dataAdapter.set(DataAdapterKey.Rulesets, CONFIG_SPEC_RESPONSE);
    const res = await Statsig.initialize('secret-key', {
      dataAdapter: dataAdapter,
    });

    expect(res.success).toEqual(true);
    expect(res.error).toBeUndefined();
    expect(res.source).toEqual('DataAdapter');
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Data Adapter - failure (fallback to network success)', async () => {
    const dataAdapter = new TestDataAdapter();
    await dataAdapter.set(DataAdapterKey.Rulesets, '');
    const res = await Statsig.initialize('secret-key', {
      dataAdapter: dataAdapter,
    });

    expect(res.success).toEqual(true);
    expect(res.error).toEqual(
      new StatsigInvalidDataAdapterValuesError(DataAdapterKey.Rulesets),
    );
    expect(res.source).toEqual('Network');
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Data Adapter - failure (fallback to network failure)', async () => {
    dcsStatus = 500;
    const dataAdapter = new TestDataAdapter();
    await dataAdapter.set(DataAdapterKey.Rulesets, '');
    const res = await Statsig.initialize('secret-key', {
      dataAdapter: dataAdapter,
    });

    expect(res.success).toEqual(false);
    expect(res.error).toEqual(
      new StatsigInitializeFromNetworkError(network500Error),
    );
    expect(res.source).toBeUndefined();
    expect(res.duration).toEqual(expect.any(Number));
  });

  it('Internal Error', async () => {
    jest
      .spyOn(SpecStore.prototype, 'init')
      .mockImplementation(async () =>
        Promise.reject(new Error('Something bad happened..')),
      );
    const res = await Statsig.initialize('secret-key');

    expect(res.success).toEqual(false);
    expect(res.error).toEqual(new Error('Something bad happened..'));
    expect(res.source).toBeUndefined();
    expect(res.duration).toEqual(expect.any(Number));
  });
});
