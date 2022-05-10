import { RulesUpdatedCallback, StatsigEnvironment } from "./StatsigOptionsType";

const DEFAULT_API = 'https://statsigapi.net/v1';

export default class StatsigOptions {

  public api: string;
  public bootstrapValues: string | null;
  public environment: StatsigEnvironment;
  public rulesUpdatedCallback: RulesUpdatedCallback;
  public localMode: boolean;
  public initTimeoutMs: number;

  public constructor(inputOptions: Record<string, unknown>) {
    this.api = this.getString(inputOptions, 'api', DEFAULT_API);
    this.bootstrapValues = this.getString(inputOptions, 'bootstrapValues', null);
    const env = this.getObject(inputOptions, 'environment', null);
    this.environment = env;
    this.rulesUpdatedCallback = this.getFunction(inputOptions, 'rulesUpdatedCallback');
    this.localMode = this.getBoolean(inputOptions, 'localMode', false);
    this.initTimeoutMs = this.getNumber(inputOptions, 'initTimeoutMs', 0);
  }


  private getBoolean(inputOptions, index, defaultValue): boolean {
    const b = inputOptions[index];
    if (b == null || typeof b !== 'boolean') {
      return defaultValue;
    }
    return b;
  }

  private getString(inputOptions, index, defaultValue): string | null {
    const str = inputOptions[index];
    if (str == null || typeof str !== 'string') {
      return defaultValue;
    }
    return str;
  }

  private getObject(inputOptions, index, defaultValue): Record<string, string | undefined> | null {
    const obj = inputOptions[index];
    if (obj == null || typeof obj !== 'object') {
      return defaultValue;
    }
    return obj;
  }

  private getFunction(inputOptions, index) {
    const func = inputOptions[index];
    if (func == null || typeof func !== 'function') {
      return null;
    }
    return func;
  }

  private getNumber(inputOptions, index, defaultValue): number {
    const obj = inputOptions[index];
    if (obj == null || typeof obj !== 'number') {
      return defaultValue;
    }
    return obj;
  }
}
