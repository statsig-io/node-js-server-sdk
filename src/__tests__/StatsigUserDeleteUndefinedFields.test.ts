import { StatsigUser } from '../StatsigUser';
import Evaluator from '../Evaluator';
import StatsigFetcher from '../utils/StatsigFetcher';
import { OptionsWithDefaults } from '../StatsigOptions';
import ErrorBoundary from '../ErrorBoundary';

describe('Evaluator - deleteUndefinedFields', () => {
  let mockedEvaluator: Evaluator;

  beforeEach(() => {
    const serverKey = "secret-test";
    const options = OptionsWithDefaults({});
    const eb = new ErrorBoundary(serverKey, options, "sessionid-a");
    const fetcher = new StatsigFetcher(serverKey, options, eb, "sessionid-a");

    mockedEvaluator = new Evaluator("secret-key", fetcher, options);
  });

  it('should delete undefined fields from a StatsigUser object', () => {
    const user: StatsigUser = {
      userID: undefined,
      email: 'example@example.com',
      ip: undefined,
      customIDs: {
        attr1: 'value',
        attr2: 'value',
      },
      userAgent: undefined,
      locale: undefined,
      appVersion: undefined,
      custom: { key1: undefined, key2: undefined },
      privateAttributes: {
        privateAttr1: undefined,
        privateAttr2: 'privateValue',
      },
      statsigEnvironment: {
        tier: undefined,
      },
    };

    // TypeScript assertion to access private method
    (mockedEvaluator as any).deleteUndefinedFields(user);

    expect(user).toEqual({
      email: 'example@example.com',
      customIDs: {
        attr1: 'value',
        attr2: 'value',
      },
      custom: {},
      privateAttributes: {
        privateAttr2: 'privateValue',
      },
      statsigEnvironment: {}
    });
  });
});