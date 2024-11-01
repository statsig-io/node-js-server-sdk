import { StatsigUser } from '../StatsigUser';

const checkGateAssertion = (
  statsig: {
    checkGate: (user: StatsigUser, gateName: string) => Promise<boolean>;
  },
  user: StatsigUser,
  gateName: string,
  expectedValue: boolean,
) => {
  const gateResult = statsig.checkGate(user, gateName);
  expect(gateResult).toBe(expectedValue);
};

export { checkGateAssertion };
