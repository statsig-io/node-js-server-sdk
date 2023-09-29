import Statsig from '..';
import { StatsigInitializeFromNetworkError } from '../Errors';
import LogEvent from '../LogEvent';
import { LoggerInterface } from '../StatsigOptions';

const logLevels = ['warn', 'error'] as ('warn' | 'error')[]
describe('Output Logger Interface', () => {
  it.each(logLevels)('verify calls to logger with log level %s', async (level) => {
    let warnings: unknown[] = [];
    let errors: unknown[] = [];
    const customLogger: LoggerInterface = {
      warn: (message?: any, ...optionalParams: any[]) => {
        warnings.push(message);
      },
      error: (message?: any, ...optionalParams: any[]) => {
        errors.push(message);
      },
      logLevel: level,
    };
    await Statsig.initialize('secret-key', { logger: customLogger });
    // @ts-ignore
    Statsig.logEvent({ userID: '123' }, null);
    expect(errors.length).toEqual(level === 'error' ? 2 : 0);
    if (level === 'error') {
      expect(errors).toContainEqual('statsigSDK::logEvent> Must provide a valid string for the eventName.');
      expect(errors).toContainEqual(new StatsigInitializeFromNetworkError());
    }
    // @ts-ignore
    let event = new LogEvent(null);
    expect(errors.length).toEqual(level === 'error' ? 3 : 0);
    Statsig.shutdown();
    // @ts-ignore
    event = new LogEvent(null);
    expect(errors.length).toEqual(level === 'error' ? 3 : 0);
  });
});
