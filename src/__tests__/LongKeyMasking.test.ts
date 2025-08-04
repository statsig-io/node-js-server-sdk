import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { StatsigInitializeFromNetworkError } from '../Errors';

jest.mock('node-fetch', () => jest.fn());

describe('Long Key Masking', () => {
  let dcsStatus: number = 500;
  const longSecretKey = 'secret-dgugaidogslfudisfj';

  beforeEach(async () => {
    const fetch = require('node-fetch');

    fetch.mockImplementation((url: string) => {
      if (url.includes('download_config_specs')) {
        return new Promise((res) => {
          setTimeout(
            () =>
              res({
                ok: dcsStatus >= 200 && dcsStatus < 300,
                text: () => Promise.resolve('{}'),
                status: dcsStatus,
              }),
            100,
          );
        });
      }

      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });
  });

  afterEach(() => {
    StatsigInstanceUtils.setInstance(null);
    dcsStatus = 500;
  });

  it('should mask long secret key with first 13 chars + **** format', async () => {
    const result = await Statsig.initialize(longSecretKey);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(StatsigInitializeFromNetworkError);
    
    const errorMessage = result.error?.message || '';
    
    expect(errorMessage).toContain('secret-dgugai****');
    
    expect(errorMessage).not.toContain('secret-dgugaidogslfudisfj');
    
    expect(errorMessage).toContain('/download_config_specs/secret-dgugai****.json');
    
    expect(errorMessage).toContain('failed with status 500');
  });

  it('should mask long key consistently across different error scenarios', async () => {
    dcsStatus = 401;
    const result401 = await Statsig.initialize(longSecretKey);
    
    expect(result401.success).toBe(false);
    const errorMessage401 = result401.error?.message || '';
    expect(errorMessage401).toContain('secret-dgugai****');
    expect(errorMessage401).not.toContain('secret-dgugaidogslfudisfj');
    expect(errorMessage401).toContain('failed with status 401');
    
    StatsigInstanceUtils.setInstance(null);
    
    dcsStatus = 403;
    const result403 = await Statsig.initialize(longSecretKey);
    
    expect(result403.success).toBe(false);
    const errorMessage403 = result403.error?.message || '';
    expect(errorMessage403).toContain('secret-dgugai****');
    expect(errorMessage403).not.toContain('secret-dgugaidogslfudisfj');
    expect(errorMessage403).toContain('failed with status 403');
  });

  it('should verify masking logic boundary - exactly 14 chars should use **** format', async () => {
    const boundaryKey = 'secret-1234567'; // exactly 14 chars
    const result = await Statsig.initialize(boundaryKey);
    
    expect(result.success).toBe(false);
    const errorMessage = result.error?.message || '';
    
    expect(errorMessage).toContain('secret-123456****');
    expect(errorMessage).not.toContain('secret-1234567');
    expect(errorMessage).not.toContain('REDACTED');
  });
});
