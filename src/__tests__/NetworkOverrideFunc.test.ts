import * as statsigsdk from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';

const statsig = statsigsdk.default;

jest.mock('node-fetch', () => jest.fn());

function verifyDcsFetchCall(call: any[]) {
  expect(call[0]).toEqual(
    'https://api.statsigcdn.com/v1/download_config_specs/secret-key.json',
  );
  expect(call[1].method).toBe('GET');
}

function verifyGetIdListsFetchCall(call: any[]) {
  expect(call[0]).toEqual('https://statsigapi.net/v1/get_id_lists');
  expect(call[1].method).toBe('POST');
}

describe('NetworkOverrideFunc', () => {
  const fetchSpy = require('node-fetch');
  const networkOverrideSpy = jest.fn();

  beforeEach(() => {
    StatsigInstanceUtils.setInstance(null);

    fetchSpy.mockClear();
    networkOverrideSpy.mockClear();
  });

  it('calls the networkOverrideFunc', async () => {
    await statsig.initialize('secret-key', {
      networkOverrideFunc: networkOverrideSpy,
    });

    expect(fetchSpy).not.toHaveBeenCalled();

    verifyDcsFetchCall(networkOverrideSpy.mock.calls[0]);
    verifyGetIdListsFetchCall(networkOverrideSpy.mock.calls[1]);
  });

  it('calls fetch when no override is given', async () => {
    await statsig.initialize('secret-key');
    expect(networkOverrideSpy).not.toHaveBeenCalled();

    verifyDcsFetchCall(fetchSpy.mock.calls[0]);
    verifyGetIdListsFetchCall(fetchSpy.mock.calls[1]);
  });
});
