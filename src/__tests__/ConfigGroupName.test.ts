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

  describe('getFeatureGate', () => {
    it.each([
      ['Has Custom', { userID: 'a-user', custom: { Foo: 'Bar' } }],
      ['Has IP From NZ', { userID: 'b-user', ip: '101.100.159.200' }],
      ['Is Beta Release', { userID: 'c-user', appVersion: '1.1.1-beta' }],
    ])('has group name `%s`', async (expected, user) => {
      const gate = await Statsig.getFeatureGate(user, 'test_many_rules');
      expect(gate.groupName).toEqual(expected);
    });

    it('returns null when no gate is found', async () => {
      const user = { userID: 'a-user' };
      const gate = await Statsig.getFeatureGate(user, 'not_a_valid_gate');
      expect(gate.groupName).toBeNull();
    });

    it('returns null when the user is locally overriden', async () => {
      const user = { userID: 'override-user', ip: '101.100.159.200' };

      Statsig.overrideGate('test_many_rules', true, 'override-user');
      const gate = await Statsig.getFeatureGate(user, 'test_many_rules');

      expect(gate.groupName).toBeNull();
    });

    it('returns null when the gate is disabled', async () => {
      const user = { userID: 'b-user' };

      const gate = await Statsig.getFeatureGate(user, 'test_disabled_gate');
      expect(gate.groupName).toBeNull();
    });
  });

  describe('getExperiment', () => {
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
});
