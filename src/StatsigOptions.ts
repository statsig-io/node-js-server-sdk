import { IConfigAdapter } from "./adapters/IConfigAdapter";
import { RulesUpdatedCallback, StatsigEnvironment } from "./StatsigOptionsType";

const DEFAULT_API = 'https://statsigapi.net/v1';

export default class StatsigOptions {

  public api: string;
  public bootstrapValues: string | null;
  public environment: StatsigEnvironment | null;
  public rulesUpdatedCallback: RulesUpdatedCallback | null;
  public localMode: boolean;
  public initTimeoutMs: number;
  public configAdapter: IConfigAdapter | null;

  public constructor(inputOptions: Record<string, unknown>) {
    this.api = this.getString(inputOptions, 'api', DEFAULT_API) ?? DEFAULT_API;
    this.bootstrapValues = this.getString(inputOptions, 'bootstrapValues', null);
    this.environment = null;
    if (inputOptions.environment != null) {
      const env = this.getObject(inputOptions, 'environment', {});
      this.environment = env as StatsigEnvironment;
    }
    const callback = this.getFunction(inputOptions, 'rulesUpdatedCallback');
    this.rulesUpdatedCallback =  callback ? callback as RulesUpdatedCallback : null;
    this.localMode = this.getBoolean(inputOptions, 'localMode', false);
    this.initTimeoutMs = this.getNumber(inputOptions, 'initTimeoutMs', 0);
    if (inputOptions.configAdapter != null) {
      const configAdapter = this.getObject(inputOptions, 'configAdapter', {});
      this.configAdapter = configAdapter as IConfigAdapter;
    }
  }


  private getBoolean(inputOptions: Record<string, unknown>, index: string, defaultValue: boolean): boolean {
    const b = inputOptions[index];
    if (b == null || typeof b !== 'boolean') {
      return defaultValue;
    }
    return b;
  }

  private getString(inputOptions: Record<string, unknown>, index: string, defaultValue: string | null): string | null {
    const str = inputOptions[index];
    if (str == null || typeof str !== 'string') {
      return defaultValue;
    }
    return str;
  }

  private getObject(inputOptions: Record<string, unknown>, index: string, defaultValue: Record<string, undefined>): Record<string, unknown> {
    const obj = inputOptions[index];
    if (obj == null || typeof obj !== 'object') {
      return defaultValue;
    }
    return obj as Record<string, unknown>;
  }

  private getFunction(inputOptions: Record<string, unknown>, index: string) {
    const func = inputOptions[index];
    if (func == null || typeof func !== 'function') {
      return null;
    }
    return func;
  }

  private getNumber(inputOptions: Record<string, unknown>, index: string, defaultValue: number): number {
    const obj = inputOptions[index];
    if (obj == null || typeof obj !== 'number') {
      return defaultValue;
    }
    return obj;
  }
}
