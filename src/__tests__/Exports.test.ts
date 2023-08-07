import * as Mod from 'statsig-node';

describe('Module Exports', () => {
  test.each([
    'StatsigUninitializedError',
    'StatsigInvalidArgumentError',
    'StatsigTooManyRequestsError',
    'StatsigLocalModeNetworkError',
    'DynamicConfig',
    'Layer',
  ])('%p', (key) => {
    expect(Mod.default[key]).toBeDefined();
    expect(Mod[key]).toBeDefined();
  });
});
