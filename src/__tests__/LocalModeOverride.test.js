describe('Test local mode with overrides', () => {
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
    const statsig = require('../../dist/src/index');
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

  it('gate overrides work', async () => {
    const statsig = require('../../dist/src/index');
    await statsig.initialize('secret-key', { localMode: true });
    expect(hitNetwork).toEqual(false);
    const userOne = { userID: '1', email: 'testuser@statsig.com' };
    const userTwo = { userID: '2', email: 'test@statsig.com' };
    expect(statsig.checkGate(userOne, 'override_gate')).resolves.toEqual(false);
    expect(statsig.checkGate(userTwo, 'override_gate')).resolves.toEqual(false);

    statsig.overrideGate('override_gate', true, '1');
    expect(statsig.checkGate(userOne, 'override_gate')).resolves.toEqual(true);
    expect(statsig.checkGate(userTwo, 'override_gate')).resolves.toEqual(false);

    statsig.overrideGate('override_gate', false, '1');
    statsig.overrideGate('override_gate', true, '2');
    expect(statsig.checkGate(userOne, 'override_gate')).resolves.toEqual(false);
    expect(statsig.checkGate(userTwo, 'override_gate')).resolves.toEqual(true);

    statsig.overrideGate('override_gate', true);
    expect(statsig.checkGate(userOne, 'override_gate')).resolves.toEqual(false);
    expect(statsig.checkGate(userTwo, 'override_gate')).resolves.toEqual(true);
    expect(
      statsig.checkGate({ userID: 'new_user' }, 'override_gate'),
    ).resolves.toEqual(true);

    // non boolean wont override
    // @ts-ignore
    statsig.overrideGate('different_gate', 'not a boolean');
    expect(statsig.checkGate(userOne, 'different_gate')).resolves.toEqual(
      false,
    );
    expect(statsig.checkGate(userTwo, 'different_gate')).resolves.toEqual(
      false,
    );

    statsig.shutdown();
    expect(hitNetwork).toEqual(false);
  });

  it('config overrides work', async () => {
    const statsig = require('../../dist/src/index');
    await statsig.initialize('secret-key', { localMode: true });
    expect(hitNetwork).toEqual(false);
    const userOne = { userID: '1', email: 'testuser@statsig.com' };
    const userTwo = { userID: '2', email: 'test@statsig.com' };
    let u1config = await statsig.getConfig(userOne, 'override_config');
    expect(u1config.getValue()).toEqual({});
    let u2config = await statsig.getConfig(userTwo, 'override_config');
    expect(u2config.getValue()).toEqual({});

    statsig.overrideConfig('override_config', { test: 'abc' }, '1');
    u1config = await statsig.getConfig(userOne, 'override_config');
    expect(u1config.getValue()).toEqual({ test: 'abc' });
    u2config = await statsig.getConfig(userTwo, 'override_config');
    expect(u2config.getValue()).toEqual({});

    statsig.overrideConfig('override_config', { test: 123 }, '2');
    statsig.overrideConfig('override_config', {}, '1');
    u1config = await statsig.getConfig(userOne, 'override_config');
    expect(u1config.getValue()).toEqual({});
    u2config = await statsig.getConfig(userTwo, 'override_config');
    expect(u2config.getValue()).toEqual({ test: 123 });

    statsig.overrideConfig('override_config', { all: true });
    u1config = await statsig.getConfig(userOne, 'override_config');
    expect(u1config.getValue()).toEqual({});
    u2config = await statsig.getConfig(userTwo, 'override_config');
    expect(u2config.getValue()).toEqual({ test: 123 });
    const u3config = await statsig.getConfig(
      { userID: 'new_user' },
      'override_config',
    );
    expect(u3config.getValue()).toEqual({ all: true });

    // non objects wont override
    // @ts-ignore
    statsig.overrideConfig('different_config', 'not an object');
    u1config = await statsig.getConfig(userOne, 'different_config');
    expect(u1config.getValue()).toEqual({});

    statsig.shutdown();
    expect(hitNetwork).toEqual(false);
  });
});
