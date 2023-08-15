import { StatsigUser } from '../StatsigUser';

const checkGateAndValidateWithAndWithoutServerFallbackAreConsistent = async (
  statsig: {
    checkGate: (user: StatsigUser, gateName: string) => Promise<boolean>;
    checkGateWithoutServerFallback: (
      user: StatsigUser,
      gateName: string,
    ) => boolean;
  },
  user: StatsigUser,
  gateName: string,
  expectedValue: boolean,
): Promise<void> => {
  const gateResult = await statsig.checkGate(user, gateName);
  expect(gateResult).toBe(expectedValue);
  expect(statsig.checkGateWithoutServerFallback(user, gateName)).toBe(
    expectedValue,
  );
};

export { checkGateAndValidateWithAndWithoutServerFallbackAreConsistent };
