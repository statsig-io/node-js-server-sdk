const statsig = require('../index');

describe('Verify e2e behavior of Statsig', () => {
  beforeAll(async () => {
    jest.restoreAllMocks();
    jest.resetModules();
    await statsig.initialize(
      'secret-9IWfdzNwExEYHEW4YfOQcFZ4xreZyFkbOXHaNbPsMwW',
      { api: 'https://latest.api.statsig.com/v1' },
    );
  });

  beforeEach(() => {});

  test('test checkGate on version', async () => {
    await expect(
      statsig.checkGate({ userID: '123' }, 'test_version'),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate({ userID: '123', appVersion: '2' }, 'test_version'),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate({ userID: '123', appVersion: '2.0' }, 'test_version'),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate({ userID: '123', appVersion: '1.3' }, 'test_version'),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate({ userID: '123', appVersion: '1.2.4' }, 'test_version'),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate(
        { userID: '123', appVersion: '1.2.3.4' },
        'test_version',
      ),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate(
        { userID: '123', appVersion: '1.2.3.5' },
        'test_version',
      ),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate(
        { userID: '123', appVersion: '1.2.3.4.1' },
        'test_version',
      ),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate({ userID: '123', appVersion: '1.10' }, 'test_version'),
    ).resolves.toEqual(false);
    await expect(
      statsig.checkGate(
        { userID: '123', appVersion: '1.10-alpha' },
        'test_version',
      ),
    ).resolves.toEqual(false);

    await expect(
      statsig.checkGate({ userID: '123', appVersion: '1' }, 'test_version'),
    ).resolves.toEqual(true);
    await expect(
      statsig.checkGate({ userID: '123', appVersion: '1.2' }, 'test_version'),
    ).resolves.toEqual(true);
    await expect(
      statsig.checkGate({ userID: '123', appVersion: '1.2.3' }, 'test_version'),
    ).resolves.toEqual(true);
    await expect(
      statsig.checkGate(
        { userID: '123', appVersion: '1.2.3.3' },
        'test_version',
      ),
    ).resolves.toEqual(true);
    await expect(
      statsig.checkGate(
        { userID: '123', appVersion: '1.2.3.3-alpha' },
        'test_version',
      ),
    ).resolves.toEqual(true);
  });
});
