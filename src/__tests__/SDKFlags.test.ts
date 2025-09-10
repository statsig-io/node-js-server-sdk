import { SDKConfigs } from '../SDKConfigs';

describe('TestSDKConfigs', () => {
  beforeEach(() => {
    (SDKConfigs as any)._flags = {};
    (SDKConfigs as any)._configs = {};
  });

  describe('Flags functionality', () => {
    it('handles empty flags', () => {
      expect(SDKConfigs.on('not_a_flag')).toBe(false);
    });

    it('handles malformed flags', () => {
      SDKConfigs.setFlags({ bad_flag: 1 } as any);
      expect(SDKConfigs.on('bad_flag')).toBe(false);
    });

    it('handles unknown flags', () => {
      SDKConfigs.setFlags('1' as any);
      expect(SDKConfigs.on('a_flag')).toBe(false);
    });

    it('handles valid flags', () => {
      SDKConfigs.setFlags({ a_flag: true });
      expect(SDKConfigs.on('a_flag')).toBe(true);
    });
  });

  describe('Configs functionality', () => {
    it('handles empty configs', () => {
      expect(SDKConfigs.getConfigStrValue('not_a_config')).toBe(null);
      expect(SDKConfigs.getConfigNumValue('not_a_config')).toBe(null);
      expect(SDKConfigs.getConfigIntValue('not_a_config')).toBe(null);
    });

    it('handles malformed configs', () => {
      SDKConfigs.setConfigs({ bad_config: 'not_a_number' });
      expect(SDKConfigs.getConfigNumValue('bad_config')).toBe(null);
      expect(SDKConfigs.getConfigIntValue('bad_config')).toBe(null);
    });

    it('handles unknown configs', () => {
      SDKConfigs.setConfigs('1' as any);
      expect(SDKConfigs.getConfigStrValue('a_config')).toBe(null);
    });

    it('handles valid string configs', () => {
      SDKConfigs.setConfigs({ string_config: 'test_value' });
      expect(SDKConfigs.getConfigStrValue('string_config')).toBe('test_value');
    });

    it('handles valid number configs', () => {
      SDKConfigs.setConfigs({ number_config: 42.5 });
      expect(SDKConfigs.getConfigNumValue('number_config')).toBe(42.5);
      expect(SDKConfigs.getConfigIntValue('number_config')).toBe(42);
    });

    it('handles valid integer configs', () => {
      SDKConfigs.setConfigs({ int_config: 100 });
      expect(SDKConfigs.getConfigNumValue('int_config')).toBe(100);
      expect(SDKConfigs.getConfigIntValue('int_config')).toBe(100);
    });

    it('handles null and undefined configs', () => {
      SDKConfigs.setConfigs({
        null_config: null,
        undefined_config: undefined,
      });
      expect(SDKConfigs.getConfigStrValue('null_config')).toBe(null);
      expect(SDKConfigs.getConfigNumValue('undefined_config')).toBe(null);
    });
  });
});
