import SDKConfigs from '../SDKConfigs';

describe('TestSDKConfigs', () => {
  beforeEach(() => {
    (SDKConfigs as any)._configs = {};
  });

  it('handles empty', () => {
    expect(SDKConfigs.get('not_a_config')).toBeUndefined();
  });

  it('handles unknown', () => {
    SDKConfigs.setConfigs('1');
    expect(SDKConfigs.get('a_config')).toBeUndefined();
  });

  it('handles valid config values', () => {
    SDKConfigs.setConfigs({ a_boolean: true, a_string: "str", a_number: 1 });
    expect(SDKConfigs.get('a_boolean')).toBe(true);
    expect(SDKConfigs.get('a_string')).toBe("str");
    expect(SDKConfigs.get('a_number')).toBe(1);
  });
});
