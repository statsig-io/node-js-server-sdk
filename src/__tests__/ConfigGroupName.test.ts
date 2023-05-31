import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/download_config_specs_group_name_test.json'),
);

describe('ConfigGroupName', () => {
  beforeEach(async () => {
    const fetch = require('node-fetch');
    fetch.mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
      });
    });

    StatsigInstanceUtils.setInstance(null);
    await Statsig.initialize('secret-key', { disableDiagnostics: true });
  });

  it.each([
    ['user-not-allocated-to-experiment-1', 'Layer Assignment'],
    ['user-allocated-to-test-6', 'Test #2'],
    ['user-allocated-to-control-3', 'Control'],
  ])('%s has group name %s', async (userID, expected) => {
    const user = { userID: userID };
    const experiment = await Statsig.getExperiment(
      user,
      'experiment_with_many_params',
    );

    expect(experiment.getGroupName()).toEqual(expected);
  });

  it('returns null when no experiment is found', async () => {
    const user = { userID: 'a-user' };
    const experiment = await Statsig.getExperiment(
      user,
      'not_a_valid_experiment',
    );

    expect(experiment.getGroupName()).toBeNull();
  });

  it('returns null when the user is locally overriden', async () => {
    const user = { userID: 'a-user' };

    Statsig.overrideConfig(
      'experiment_with_many_params',
      { foo: 'bar' },
      user.userID,
    );

    const experiment = await Statsig.getExperiment(
      user,
      'experiment_with_many_params',
    );

    expect(experiment.getGroupName()).toBeNull();
  });

  it('returns null when the config is disabled', async () => {
    const user = { userID: 'b-user' };

    const experiment = await Statsig.getExperiment(user, 'disabled_config');

    expect(experiment.getGroupName()).toBeNull();
  });
});
