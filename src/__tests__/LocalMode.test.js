const { hasUncaughtExceptionCaptureCallback } = require('process');

describe('Test condition evaluation', () => {
  jest.mock('node-fetch', () => jest.fn());
  let hitNetwork = false;
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    const fetch = require('node-fetch');
    fetch.mockImplementation(() => {
      hitNetwork = true;
      return Promise.reject(
        new Error('Should not access network in local mode'),
      );
    });
  });

  it('initalize resolves and all values are defualts', async () => {
    const statsig = require('../index');
    await statsig.initialize('secret-key', { localMode: true });
    expect(hitNetwork).toEqual(false);
    expect(statsig.checkGate({ userID: 'test' }, 'any_gate')).resolves.toEqual(
      false,
    );

    const config = await statsig.getConfig({ userID: 'test' }, 'any_config');
    expect(config.getValue()).toEqual({});

    const experiment = await statsig.getExperiment(
      { userID: 'test' },
      'any_experiment',
    );
    expect(experiment.getValue()).toEqual({});

    statsig.shutdown();
    expect(hitNetwork).toEqual(false);
  });
});
