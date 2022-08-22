import { IConfigAdapter } from "./adapters/IConfigAdapter";
import { ILoggingAdapter } from "./adapters/ILoggingAdapter";

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
  configAdapter?: IConfigAdapter;
  loggingAdapter?: ILoggingAdapter; 
};

export type RulesUpdatedCallback = (rulesJSON: string, time: number) => void;

export type StatsigEnvironment = {
  tier?: 'production' | 'staging' | 'development';
  [key: string]: string | undefined;
};
