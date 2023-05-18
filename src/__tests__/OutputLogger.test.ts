import Statsig from '..';
import LogEvent from '../LogEvent';
import { LoggerInterface } from '../StatsigOptions';

describe('Output Logger Interface', () => {
  it('verify calls to logger', async () => {
    let warnings: unknown[] = [];
    let errors: unknown[] = [];
    const customLogger: LoggerInterface = {
      warn: (message?: any, ...optionalParams: any[]) => {
        warnings.push(message);
      },
      error: (message?: any, ...optionalParams: any[]) => {
        errors.push(message);
      },
    };
    await Statsig.initialize('secret-key', { logger: customLogger });
    // @ts-ignore
    Statsig.logEvent({ userID: '123' }, null);
    expect(errors.length).toEqual(2);
    expect(errors).toContainEqual('statsigSDK::logEvent> Must provide a valid string for the eventName.')
    // @ts-ignore
    let event = new LogEvent(null);
    expect(errors.length).toEqual(3);
    Statsig.shutdown();
    // @ts-ignore
    event = new LogEvent(null);
    expect(errors.length).toEqual(3);
  });
});
