/**
 * An object of properties for initializing the sdk with advanced options
 */
export type StatsigOptionsType = {
  api?: string;
  bootstrapValues?: string;
  environment?: StatsigEnvironment;
  localMode?: boolean;
  rulesUpdatedCallback?: RulesUpdatedCallback;
  initTimeoutMs?: number;
};

export type RulesUpdatedCallback = (rulesJSON: string, time: number) => void;

export type StatsigEnvironment = {
  tier?: 'production' | 'staging' | 'development';
  [key: string]: string | undefined;
};
