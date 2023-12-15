import SDKFlags from '../SDKFlags';

describe('TestSDKFlags', () => {
  beforeEach(() => {
    (SDKFlags as any)._flags = {};
  });

  it('handles empty', () => {
    expect(SDKFlags.on('not_a_flag')).toBe(false);
  });

  it('handles malformed', () => {
    SDKFlags.setFlags({ bad_flag: 1 });
    expect(SDKFlags.on('bad_flag')).toBe(false);
  });

  it('handles unknown', () => {
    SDKFlags.setFlags('1');
    expect(SDKFlags.on('a_flag')).toBe(false);
  });

  it('handles valid flags', () => {
    SDKFlags.setFlags({ a_flag: true });
    expect(SDKFlags.on('a_flag')).toBe(true);
  });
});
