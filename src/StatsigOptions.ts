import DynamicConfig from './DynamicConfig';
import { FeatureGate } from './FeatureGate';
import { IDataAdapter } from './interfaces/IDataAdapter';
import {
  IUserPersistentStorage,
  UserPersistedValues,
} from './interfaces/IUserPersistentStorage';
import Layer from './Layer';
import LogEvent from './LogEvent';
import { StatsigUser } from './StatsigUser';
import { HashingAlgorithm } from './utils/Hashing';
import { STATSIG_API, STATSIG_CDN } from './utils/StatsigFetcher';

const DEFAULT_RULESETS_SYNC_INTERVAL = 10 * 1000;
const MIN_RULESETS_SYNC_INTERVAL = 5 * 1000;
const DEFAULT_ID_LISTS_SYNC_INTERVAL = 60 * 1000;
const MIN_ID_LISTS_SYNC_INTERVAL = 30 * 1000;
const DEFAULT_LOGGING_INTERVAL = 60 * 1000;
const DEFAULT_MAX_LOGGING_BUFFER_SIZE = 1000;
const DEFAULT_LOG_DIAGNOSTICS = false;
const DEFAULT_POST_LOGS_RETRY_LIMIT = 5;
const DEFAULT_POST_LOGS_RETRY_BACKOFF = 1000;

export type RulesUpdatedCallback = (rulesJSON: string, time: number) => void;
export type RetryBackoffFunc = (retriesRemaining: number) => number;

// eslint-disable-next-line @typescript-eslint/ban-types
type StringLiteralOrString<T extends string> = T | (string & {});

export type StatsigEnvironment = {
  tier?: StringLiteralOrString<'production' | 'staging' | 'development'>;
  [key: string]: string | undefined;
};

export type InitStrategy = 'await' | 'lazy' | 'none';

export interface LoggerInterface {
  debug?(message?: any, ...optionalParams: any[]): void;
  info?(message?: any, ...optionalParams: any[]): void;
  warn(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
  logLevel: 'none' | 'debug' | 'info' | 'warn' | 'error';
}

export type NetworkOverrideFunc = (
  url: string,
  params: RequestInit,
) => Promise<Response>;

export type EvaluationCallbacks = {
  gateCallback?: (
    gate: FeatureGate,
    user: StatsigUser,
    event: LogEvent,
  ) => void;
  dynamicConfigCallback?: (
    config: DynamicConfig,
    user: StatsigUser,
    event: LogEvent,
  ) => void;
  experimentCallback?: (
    config: DynamicConfig,
    user: StatsigUser,
    event: LogEvent,
  ) => void;
  layerCallback?: (layer: Layer, user: StatsigUser) => void;
  layerParamCallback?: (
    layer: Layer,
    paramName: string,
    user: StatsigUser,
    event: LogEvent,
  ) => void;
};

export type ExplicitStatsigOptions = {
  api: string;
  apiForDownloadConfigSpecs: string;
  apiForGetIdLists: string;
  fallbackToStatsigAPI: boolean;
  networkOverrideFunc: NetworkOverrideFunc | null;
  bootstrapValues: string | null;
  environment: StatsigEnvironment | null;
  rulesUpdatedCallback: RulesUpdatedCallback | null;
  logger: LoggerInterface;
  localMode: boolean;
  initTimeoutMs: number;
  dataAdapter: IDataAdapter | null;
  rulesetsSyncIntervalMs: number;
  idListsSyncIntervalMs: number;
  loggingIntervalMs: number;
  loggingMaxBufferSize: number;
  disableDiagnostics: boolean;
  initStrategyForIP3Country: InitStrategy;
  initStrategyForIDLists: InitStrategy;
  postLogsRetryLimit: number;
  postLogsRetryBackoff: RetryBackoffFunc | number;
  disableRulesetsSync: boolean;
  disableIdListsSync: boolean;
  disableAllLogging: boolean;
  userPersistentStorage: IUserPersistentStorage | null;
  evaluationCallback?: (config: FeatureGate | DynamicConfig | Layer) => void;
  evaluationCallbacks?: EvaluationCallbacks;
};

/**
 * An object of properties for initializing the sdk with advanced options
 */
export type StatsigOptions = Partial<ExplicitStatsigOptions>;

export function OptionsWithDefaults(
  opts: StatsigOptions,
): ExplicitStatsigOptions {
  return {
    api: normalizeUrl(
      getString(opts, 'api', STATSIG_API) ?? STATSIG_API,
    ) as string,
    apiForDownloadConfigSpecs:
      normalizeUrl(
        getString(opts, 'apiForDownloadConfigSpecs', opts.api ?? null),
      ) ?? STATSIG_CDN,
    apiForGetIdLists:
      normalizeUrl(getString(opts, 'apiForGetIdLists', opts.api ?? null)) ??
      STATSIG_API,
    fallbackToStatsigAPI: getBoolean(opts, 'fallbackToStatsigAPI', false),
    networkOverrideFunc: opts.networkOverrideFunc ?? null,
    bootstrapValues: getString(opts, 'bootstrapValues', null),
    environment: opts.environment
      ? (getObject(opts, 'environment', {}) as StatsigEnvironment)
      : null,
    rulesUpdatedCallback: opts.rulesUpdatedCallback
      ? (getFunction(opts, 'rulesUpdatedCallback') as RulesUpdatedCallback)
      : null,
    localMode: getBoolean(opts, 'localMode', false),
    initTimeoutMs: getNumber(opts, 'initTimeoutMs', 0),
    logger: opts.logger ?? { ...console, logLevel: 'warn' },
    dataAdapter: opts.dataAdapter ?? null,
    rulesetsSyncIntervalMs: Math.max(
      getNumber(opts, 'rulesetsSyncIntervalMs', DEFAULT_RULESETS_SYNC_INTERVAL),
      MIN_RULESETS_SYNC_INTERVAL,
    ),
    idListsSyncIntervalMs: Math.max(
      getNumber(opts, 'idListsSyncIntervalMs', DEFAULT_ID_LISTS_SYNC_INTERVAL),
      MIN_ID_LISTS_SYNC_INTERVAL,
    ),
    loggingIntervalMs: getNumber(
      opts,
      'loggingIntervalMs',
      DEFAULT_LOGGING_INTERVAL,
    ),
    loggingMaxBufferSize: Math.min(
      getNumber(opts, 'loggingMaxBufferSize', DEFAULT_MAX_LOGGING_BUFFER_SIZE),
      DEFAULT_MAX_LOGGING_BUFFER_SIZE,
    ),
    disableDiagnostics: getBoolean(
      opts,
      'disableDiagnostics',
      DEFAULT_LOG_DIAGNOSTICS,
    ),
    initStrategyForIP3Country:
      (getString(
        opts,
        'initStrategyForIP3Country',
        'await',
      ) as InitStrategy | null) ?? 'await',
    initStrategyForIDLists:
      (getString(
        opts,
        'initStrategyForIDLists',
        'await',
      ) as InitStrategy | null) ?? 'await',
    postLogsRetryLimit: getNumber(
      opts,
      'postLogsRetryLimit',
      DEFAULT_POST_LOGS_RETRY_LIMIT,
    ),
    postLogsRetryBackoff:
      opts.postLogsRetryBackoff ?? DEFAULT_POST_LOGS_RETRY_BACKOFF,
    disableRulesetsSync: opts.disableRulesetsSync ?? false,
    disableIdListsSync: opts.disableIdListsSync ?? false,
    disableAllLogging: opts.disableAllLogging ?? false,
    userPersistentStorage: opts.userPersistentStorage ?? null,
    evaluationCallback: opts.evaluationCallback ?? undefined,
    evaluationCallbacks: opts.evaluationCallbacks ?? {},
  };
}

export function OptionsLoggingCopy(
  options: Record<string, unknown>,
): StatsigOptions {
  const loggingCopy: Record<string, unknown> = {};
  Object.entries(options).forEach(([option, value]) => {
    const valueType = typeof value;
    switch (valueType) {
      case 'number':
      case 'bigint':
      case 'boolean':
        loggingCopy[String(option)] = value;
        break;
      case 'string':
        if ((value as string).length < 50) {
          loggingCopy[String(option)] = value;
        } else {
          loggingCopy[String(option)] = 'set';
        }
        break;
      case 'object':
        if (option === 'environment') {
          loggingCopy['environment'] = value;
        } else {
          loggingCopy[String(option)] = value != null ? 'set' : 'unset';
        }
        break;
      case 'function':
        if (option === 'dataAdapter') {
          loggingCopy[String(option)] = 'set';
        }
        break;
      default:
      // Ignore other fields
    }
  });
  return loggingCopy;
}

function getBoolean(
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

function getString(
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

function getObject(
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

function getFunction(inputOptions: Record<string, unknown>, index: string) {
  const func = inputOptions[index];
  if (func == null || typeof func !== 'function') {
    return null;
  }
  return func;
}

function getNumber(
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

function normalizeUrl(url: string | null): string | null {
  return url && url.endsWith('/') ? url.slice(0, -1) : url;
}

export type PersistentAssignmentOptions = {
  /* Whether or not to enforce targeting rules before assigning persisted values */
  enforceTargeting?: boolean;
};

export type CheckGateOptions = CoreApiOptions;
export type GetConfigOptions = CoreApiOptions;

export type GetExperimentOptions = CoreApiOptions & {
  /* Persisted values to use for experiment assignment */
  userPersistedValues?: UserPersistedValues | null;
  /* Additional options for using persistent assignment */
  persistentAssignmentOptions?: PersistentAssignmentOptions;
};

export type GetLayerOptions = CoreApiOptions & {
  /* Persisted values to use for layer assignment */
  userPersistedValues?: UserPersistedValues | null;
  /* Additional options for using persistent assignment */
  persistentAssignmentOptions?: PersistentAssignmentOptions;
};

export type CoreApiOptions = {
  disableExposureLogging?: boolean;
};

export interface ClientInitializeResponseValueOverride {
  value?: Record<string, unknown>;
}

export interface ClientInitializeResponseExperimentOverride
  extends ClientInitializeResponseValueOverride {
  groupName?: string;
}

export type ClientInitializeResponseOptions = {
  hash?: HashingAlgorithm;
  includeLocalOverrides?: boolean;
  /**
   * Overrides for the generated client initialize response.
   * To override an experiment, use the dynamicConfigs object. You can override
   * the value directly with the 'value' property, or set the 'groupName' property
   * to use the value associated with that group.
   *
   * @example
   * {
   *   overrides: {
   *     featureGates: {
   *       'my_gate': true,             // Override gate value to true
   *     },
   *
   *     dynamicConfigs: {
   *       'price_config': {
   *         value: { price: 9.99 }     // Override value only
   *       },
   *       'color_experiment': {
   *         groupName: 'Control'       // Override group assignment only
   *       },
   *       'spacing_experiment': {
   *         value: { spacing: 64 },    // Override both value and
   *         groupName: 'Variant_B'     // group assignment
   *       }
   *     },
   *
   *     layers: {
   *       'my_layer': {
   *         value: { param: 123 }      // Override layer value
   *       }
   *     }
   *   }
   * }
   *
   */
  overrides?: {
    featureGates?: Record<string, boolean>;
    dynamicConfigs?: Record<string, ClientInitializeResponseExperimentOverride>;
    layers?: Record<string, ClientInitializeResponseValueOverride>;
  };
};
