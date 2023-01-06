import { StatsigEnvironment } from './StatsigOptions';

export type StatsigUser =
  // at least one of userID or customIDs must be provided
  ({ userID: string } | { customIDs: Record<string, string> }) & {
    userID?: string;
    customIDs?: Record<string, string>;
    email?: string;
    ip?: string;
    userAgent?: string;
    country?: string;
    locale?: string;
    appVersion?: string;
    custom?: Record<
      string,
      string | number | boolean | Array<string> | undefined
    >;
    privateAttributes?: Record<
      string,
      string | number | boolean | Array<string> | undefined
    > | null;
    statsigEnvironment?: StatsigEnvironment;
  };
