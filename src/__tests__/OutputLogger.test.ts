import Statsig from '..';
import { StatsigInitializeFromNetworkError, StatsigInitializeIDListsError } from '../Errors';
import LogEvent from '../LogEvent';
import { LoggerInterface } from '../StatsigOptions';

const logLevels = ['none', 'error'] as const
describe('Output Logger Interface', () => {
  it.each(logLevels)('verify calls to logger with log level %s', async (level) => {
    const warnings: unknown[] = [];
    const errors: unknown[] = [];
    const customLogger: LoggerInterface = {
      warn: (message?: any, ...optionalParams: any[]) => {
        warnings.push(message);
      },
      error: (message?: any, ...optionalParams: any[]) => {
        errors.push(message);
      },
      logLevel: level,
    };
    const secretKey = 'secret-key';
    await Statsig.initialize(secretKey, { logger: customLogger });
    // @ts-ignore
    Statsig.logEvent({ userID: '123' }, null);
    expect(errors.length).toEqual(level === 'error' ? 3 : 0);
    if (level === 'error') {
      expect(errors).toContainEqual('statsigSDK> EventName needs to be a string of non-zero length.');
      expect(errors).toContainEqual((new StatsigInitializeFromNetworkError(new Error(`Request to https://api.statsigcdn.com/v1/download_config_specs/******.json?sinceTime=0 failed with status 401`))).toString());
      expect(errors).toContainEqual((new StatsigInitializeIDListsError(new Error('Request to https://statsigapi.net/v1/get_id_lists failed with status 401'))).toString());
    }
    // @ts-ignore
    let event = new LogEvent(null);
    expect(errors.length).toEqual(level === 'error' ? 4 : 0);
    Statsig.shutdown();
    // @ts-ignore
    event = new LogEvent(null);
    expect(errors.length).toEqual(level === 'error' ? 4 : 0);
  });
});
