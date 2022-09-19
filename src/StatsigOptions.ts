import { IDataAdapter } from './interfaces/IDataAdapter';
import { RulesUpdatedCallback, StatsigEnvironment, StatsigOptionsType } from './StatsigOptionsType';

const DEFAULT_API = 'https://statsigapi.net/v1';
const DEFAULT_RULESETS_SYNC_INTERVAL = 10 * 1000;
const MIN_RULESETS_SYNC_INTERVAL = 5 * 1000;
const DEFAULT_ID_LISTS_SYNC_INTERVAL = 60 * 1000;
const MIN_ID_LISTS_SYNC_INTERVAL = 30 * 1000;
const DEFAULT_LOGGING_INTERVAL = 60 * 1000;
const DEFAULT_MAX_LOGGING_BUFFER_SIZE = 1000;

export default class StatsigOptions {
  public api: string;
  public bootstrapValues: string | null;
  public environment: StatsigEnvironment | null;
  public rulesUpdatedCallback: RulesUpdatedCallback | null;
  public localMode: boolean;
  public initTimeoutMs: number;
  public dataAdapter: IDataAdapter | null;
  public rulesetsSyncIntervalMs: number;
  public idListsSyncIntervalMs: number;
  public loggingIntervalMs: number;
  public loggingMaxBufferSize: number;

  public constructor(inputOptions: StatsigOptionsType) {
    const opts = inputOptions;

    this.api = this.getString(opts, 'api', DEFAULT_API) ?? DEFAULT_API;

    this.bootstrapValues = this.getString(opts, 'bootstrapValues', null);

    this.environment = null;
    if (opts.environment != null) {
      const env = this.getObject(opts, 'environment', {});
      this.environment = env as StatsigEnvironment;
    }

    const callback = this.getFunction(opts, 'rulesUpdatedCallback');
    this.rulesUpdatedCallback = callback
      ? (callback as RulesUpdatedCallback)
      : null;

    this.localMode = this.getBoolean(opts, 'localMode', false);

    this.initTimeoutMs = this.getNumber(opts, 'initTimeoutMs', 0);

    this.dataAdapter = opts.dataAdapter ?? null;
    
    this.rulesetsSyncIntervalMs = this.getNumber(
      opts,
      'rulesetsSyncIntervalMs',
      DEFAULT_RULESETS_SYNC_INTERVAL,
    );
    this.rulesetsSyncIntervalMs = Math.max(
      this.rulesetsSyncIntervalMs,
      MIN_RULESETS_SYNC_INTERVAL,
    );

    this.idListsSyncIntervalMs = this.getNumber(
      opts,
      'idListsSyncIntervalMs',
      DEFAULT_ID_LISTS_SYNC_INTERVAL,
    );
    this.idListsSyncIntervalMs = Math.max(
      this.idListsSyncIntervalMs,
      MIN_ID_LISTS_SYNC_INTERVAL,
    );

    this.loggingIntervalMs = this.getNumber(
      opts,
      'loggingIntervalMs',
      DEFAULT_LOGGING_INTERVAL,
    );

    this.loggingMaxBufferSize = Math.min(
      this.getNumber(
        opts,
        'loggingMaxBufferSize',
        DEFAULT_MAX_LOGGING_BUFFER_SIZE,
      ),
      DEFAULT_MAX_LOGGING_BUFFER_SIZE,
    );
  }

  private getBoolean(
    inputOptions: Record<string, unknown>,
    index: string,
    defaultValue: boolean,
  ): boolean {
    const b = inputOptions[index];
    if (b == null || typeof b !== 'boolean') {
      return defaultValue;
    }
    return b;
  }

  private getString(
    inputOptions: Record<string, unknown>,
    index: string,
    defaultValue: string | null,
  ): string | null {
    const str = inputOptions[index];
    if (str == null || typeof str !== 'string') {
      return defaultValue;
    }
    return str;
  }

  private getObject(
    inputOptions: Record<string, unknown>,
    index: string,
    defaultValue: Record<string, undefined>,
  ): Record<string, unknown> {
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

  private getNumber(
    inputOptions: Record<string, unknown>,
    index: string,
    defaultValue: number,
  ): number {
    const obj = inputOptions[index];
    if (obj == null || typeof obj !== 'number') {
      return defaultValue;
    }
    return obj;
  }
}
