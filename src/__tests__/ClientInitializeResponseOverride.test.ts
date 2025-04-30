import * as statsigsdk from '../index';
import Statsig, { StatsigUser } from '../index';

// @ts-ignore
const statsig = statsigsdk.default;

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/download_config_spec.json'),
);

const user: StatsigUser = {
  userID: 'a-user',
};
const clientKey = 'client-key';

describe('ClientInitializeResponse overrides', () => {
  beforeAll(async () => {
    const fetch = require('node-fetch');
    fetch.mockImplementation((url: string, params) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
        });
      }

      if (url.includes('log_event')) {
        return Promise.resolve({
          ok: true,
        });
      }

      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });

    await Statsig.initialize('secret-key', {
      disableDiagnostics: true,
    });
  });

  it('can override feature gates', async () => {
    const noOverrides = statsig.getClientInitializeResponse(user, clientKey, {
      hash: 'none',
    });
    expect(noOverrides?.feature_gates['always_on_gate'].value).toBe(true);
    const overridden = statsig.getClientInitializeResponse(user, clientKey, {
      hash: 'none',
      overrides: {
        featureGates: {
          always_on_gate: false,
        },
      },
    });
    expect(overridden?.feature_gates['always_on_gate'].value).toBe(false);
  });

  it('can override dynamic configs', async () => {
    const noOverrides = statsig.getClientInitializeResponse(user, clientKey, {
      hash: 'none',
    });
    expect(
      noOverrides?.dynamic_configs['sample_experiment'].value,
    ).toMatchObject({
      sample_parameter: expect.any(Boolean),
    });
    expect(
      noOverrides?.dynamic_configs['sample_experiment'].group_name,
    ).toMatch(/^(Test|Control)$/);

    const overriddenControl = statsig.getClientInitializeResponse(
      user,
      clientKey,
      {
        hash: 'none',
        overrides: {
          dynamicConfigs: {
            sample_experiment: {
              groupName: 'Control',
            },
          },
        },
      },
    );
    expect(
      overriddenControl?.dynamic_configs['sample_experiment'].group_name,
    ).toBe('Control');
    expect(
      overriddenControl?.dynamic_configs['sample_experiment'].value,
    ).toMatchObject({
      sample_parameter: false,
    });

    const overriddenTest = statsig.getClientInitializeResponse(
      user,
      clientKey,
      {
        hash: 'none',
        overrides: {
          dynamicConfigs: {
            sample_experiment: {
              groupName: 'Test',
            },
          },
        },
      },
    );
    expect(
      overriddenTest?.dynamic_configs['sample_experiment'].group_name,
    ).toBe('Test');
    expect(
      overriddenTest?.dynamic_configs['sample_experiment'].value,
    ).toMatchObject({
      sample_parameter: true,
    });
  });
});
