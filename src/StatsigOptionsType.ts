/**
 * An object of properties for initializing the sdk with advanced options
 */
export type StatsigOptionsType = {
  api?: string;
  bootstrapValues?: string;
  environment?: StatsigEnvironment;
  localMode?: boolean;
  rulesUpdatedCallback?: { (rulesJSON: string, time: number): void };
  initTimeoutMs?: number;
};

export type StatsigEnvironment = {
  tier?: 'production' | 'staging' | 'development';
  [key: string]: string | undefined;
};
