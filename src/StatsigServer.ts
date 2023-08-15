import ConfigEvaluation from './ConfigEvaluation';
import Diagnostics from './Diagnostics';
import DynamicConfig, { OnDefaultValueFallback } from './DynamicConfig';
import ErrorBoundary from './ErrorBoundary';
import {
  StatsigInvalidArgumentError,
  StatsigUninitializedError,
} from './Errors';
import Evaluator from './Evaluator';
import {
  FeatureGate,
  makeEmptyFeatureGate,
  makeFeatureGate,
} from './FeatureGate';
import Layer from './Layer';
import LogEvent from './LogEvent';
import LogEventProcessor from './LogEventProcessor';
import OutputLogger from './OutputLogger';
import {
  ExplicitStatsigOptions,
  OptionsWithDefaults,
  StatsigOptions,
} from './StatsigOptions';
import { StatsigUser } from './StatsigUser';
import StatsigFetcher from './utils/StatsigFetcher';
import { getStatsigMetadata, isUserIdentifiable } from './utils/core';

const MAX_VALUE_SIZE = 64;
const MAX_OBJ_SIZE = 2048;
const MAX_USER_SIZE = 2048;
let hasLoggedNoUserIdWarning = false;

enum ExposureLogging {
  Disabled = 'exposures_disabled',
  Enabled = 'exposures_enabled',
}

enum ExposureCause {
  Automatic = 'automatic_exposure',
  Manual = 'manual_exposure',
}

export type LogEventObject = {
  eventName: string;
  user: StatsigUser;
  value?: string | number | null;
  metadata?: Record<string, unknown> | null;
  time?: string | null;
};

type GetGateImplResponse =
  | {
      type: 'valid';
      gate: FeatureGate;
    }
  | {
      type: 'error';
      error: Error;
    }
  | {
      type: 'fallback';
    };

/**
 * The global statsig class for interacting with gates, configs, experiments configured in the statsig developer console.  Also used for event logging to view in the statsig console, or for analyzing experiment impacts using pulse.
 */
export default class StatsigServer {
  private _pendingInitPromise: Promise<void> | null = null;
  private _ready: boolean = false;
  private _options: ExplicitStatsigOptions;
  private _logger: LogEventProcessor;
  private _secretKey: string;
  private _evaluator: Evaluator;
  private _fetcher: StatsigFetcher;
  private _errorBoundary: ErrorBoundary;
  private outputLogger = OutputLogger.getLogger();

  public constructor(secretKey: string, options: StatsigOptions = {}) {
    this._secretKey = secretKey;
    this._options = OptionsWithDefaults(options);
    this._pendingInitPromise = null;
    this._ready = false;
    this._fetcher = new StatsigFetcher(this._secretKey, this._options);
    this._logger = new LogEventProcessor(this._fetcher, this._options);
    Diagnostics.initialize({
      logger: this._logger,
      options: this._options,
    });
    this._evaluator = new Evaluator(this._fetcher, this._options);
    this._errorBoundary = new ErrorBoundary(secretKey);
  }

  /**
   * Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.
   * @throws Error if a Server Secret Key is not provided
   */
  public initializeAsync(): Promise<void> {
    return this._errorBoundary.capture(
      () => {
        if (this._pendingInitPromise != null) {
          return this._pendingInitPromise;
        }

        if (this._ready === true) {
          return Promise.resolve();
        }
        if (
          typeof this._secretKey !== 'string' ||
          this._secretKey.length === 0 ||
          !this._secretKey.startsWith('secret-')
        ) {
          return Promise.reject(
            new StatsigInvalidArgumentError(
              'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk',
            ),
          );
        }
        Diagnostics.setContext('initialize');
        Diagnostics.mark.overall.start({});

        const initPromise = this._evaluator.init().finally(() => {
          this._ready = true;
          this._pendingInitPromise = null;
          Diagnostics.mark.overall.end({ success: true });
          Diagnostics.logDiagnostics('initialize');
          Diagnostics.setContext('config_sync');
        });
        if (
          this._options.initTimeoutMs != null &&
          this._options.initTimeoutMs > 0
        ) {
          this._pendingInitPromise = Promise.race([
            initPromise,
            new Promise((resolve) => {
              setTimeout(() => {
                Diagnostics.mark.overall.end({
                  success: false,
                  reason: 'timeout',
                });
                Diagnostics.logDiagnostics('initialize');
                Diagnostics.setContext('config_sync');
                this._ready = true;
                this._pendingInitPromise = null;
                resolve();
              }, this._options.initTimeoutMs);
            }) as Promise<void>,
          ]);
        } else {
          this._pendingInitPromise = initPromise;
        }
        return this._pendingInitPromise;
      },
      () => {
        this._ready = true;
        this._pendingInitPromise = null;
        return Promise.resolve();
      },
    );
  }

  /**
   * Check the value of a gate configured in the statsig console
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  public checkGate(user: StatsigUser, gateName: string): Promise<boolean> {
    return this._errorBoundary.capture(
      () =>
        this.getGateImplWithServerFallback(
          user,
          gateName,
          ExposureLogging.Enabled,
        ).then((gate) => gate.value),
      () => Promise.resolve(false),
    );
  }

  /**
   * Check the value of a gate configured in the statsig console
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  public checkGateWithoutServerFallback(
    user: StatsigUser,
    gateName: string,
  ): boolean {
    return this._errorBoundary.capture(
      () => {
        const result = this.getGateImpl(
          user,
          gateName,
          ExposureLogging.Enabled,
          false,
        );

        switch (result.type) {
          case 'valid':
            return result.gate.value;
          case 'error':
            throw result.error;
          case 'fallback':
            return false;
        }
      },
      () => false,
    );
  }

  public getFeatureGate(
    user: StatsigUser,
    gateName: string,
  ): Promise<FeatureGate> {
    return this._errorBoundary.capture(
      () =>
        this.getGateImplWithServerFallback(
          user,
          gateName,
          ExposureLogging.Enabled,
        ),
      () => Promise.resolve(makeEmptyFeatureGate(gateName)),
    );
  }

  public async checkGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): Promise<boolean> {
    return this.getFeatureGateWithExposureLoggingDisabled(user, gateName).then(
      (gate) => gate.value,
    );
  }

  public getFeatureGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): Promise<FeatureGate> {
    return this._errorBoundary.capture(
      () =>
        this.getGateImplWithServerFallback(
          user,
          gateName,
          ExposureLogging.Disabled,
        ),
      () => Promise.resolve(makeEmptyFeatureGate(gateName)),
    );
  }

  public logGateExposure(user: StatsigUser, gateName: string) {
    const evaluation = this._evaluator.checkGate(user, gateName);
    this.logGateExposureImpl(user, gateName, evaluation, ExposureCause.Manual);
  }

  /**
   * Checks the value of a config for a given user
   * @throws Error if initialize() was not called first
   * @throws Error if the configName is not provided or not a non-empty string
   */
  public getConfig(
    user: StatsigUser,
    configName: string,
  ): Promise<DynamicConfig> {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, configName, ExposureLogging.Enabled),
      () => Promise.resolve(new DynamicConfig(configName)),
    );
  }

  public getConfigWithExposureLoggingDisabled(
    user: StatsigUser,
    configName: string,
  ): Promise<DynamicConfig> {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, configName, ExposureLogging.Disabled),
      () => Promise.resolve(new DynamicConfig(configName)),
    );
  }

  public logConfigExposure(user: StatsigUser, configName: string) {
    const evaluation = this._evaluator.getConfig(user, configName);
    this.logConfigExposureImpl(
      user,
      configName,
      evaluation,
      ExposureCause.Manual,
    );
  }

  /**
   * Checks the value of a config for a given user
   * @throws Error if initialize() was not called first
   * @throws Error if the experimentName is not provided or not a non-empty string
   */
  public getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, experimentName, ExposureLogging.Enabled),
      () => Promise.resolve(new DynamicConfig(experimentName)),
    );
  }

  public getExperimentWithExposureLoggingDisabled(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, experimentName, ExposureLogging.Disabled),
      () => Promise.resolve(new DynamicConfig(experimentName)),
    );
  }

  public logExperimentExposure(user: StatsigUser, experimentName: string) {
    const evaluation = this._evaluator.getConfig(user, experimentName);
    this.logConfigExposureImpl(
      user,
      experimentName,
      evaluation,
      ExposureCause.Manual,
    );
  }

  /**
   * Checks the value of a config for a given user
   * @throws Error if initialize() was not called first
   * @throws Error if the layerName is not provided or not a non-empty string
   */
  public getLayer(user: StatsigUser, layerName: string): Promise<Layer> {
    return this._errorBoundary.capture(
      () => this.getLayerImpl(user, layerName, ExposureLogging.Enabled),
      () => Promise.resolve(new Layer(layerName)),
    );
  }

  public getLayerWithExposureLoggingDisabled(
    user: StatsigUser,
    layerName: string,
  ): Promise<Layer> {
    return this._errorBoundary.capture(
      () => this.getLayerImpl(user, layerName, ExposureLogging.Disabled),
      () => Promise.resolve(new Layer(layerName)),
    );
  }

  public logLayerParameterExposure(
    user: StatsigUser,
    layerName: string,
    parameterName: string,
  ) {
    const evaluation = this._evaluator.getLayer(user, layerName);
    this.logLayerParameterExposureImpl(
      user,
      layerName,
      parameterName,
      evaluation,
      ExposureCause.Manual,
    );
  }

  /**
   * Log an event for data analysis and alerting or to measure the impact of an experiment
   * @throws Error if initialize() was not called first
   */
  public logEvent(
    user: StatsigUser,
    eventName: string,
    value: string | number | null = null,
    metadata: Record<string, unknown> | null = null,
  ) {
    return this._errorBoundary.swallow(() =>
      this.logEventObject({
        eventName: eventName,
        user: user,
        value: value,
        metadata: metadata,
      }),
    );
  }

  public logEventObject(eventObject: LogEventObject) {
    return this._errorBoundary.swallow(() => {
      let eventName = eventObject.eventName;
      let user = eventObject.user ?? null;
      let value = eventObject.value ?? null;
      let metadata = eventObject.metadata ?? null;
      let time = eventObject.time ?? null;

      if (!(this._ready === true && this._logger != null)) {
        throw new StatsigUninitializedError();
      }
      if (typeof eventName !== 'string' || eventName.length === 0) {
        this.outputLogger.error(
          'statsigSDK::logEvent> Must provide a valid string for the eventName.',
        );
        return;
      }
      if (!isUserIdentifiable(user) && !hasLoggedNoUserIdWarning) {
        hasLoggedNoUserIdWarning = true;
        this.outputLogger.warn(
          'statsigSDK::logEvent> No valid userID was provided. Event will be logged but not associated with an identifiable user. This message is only logged once.',
        );
      }
      user = normalizeUser(user, this._options);
      if (shouldTrimParam(eventName, MAX_VALUE_SIZE)) {
        this.outputLogger.warn(
          'statsigSDK::logEvent> eventName is too long, trimming to ' +
            MAX_VALUE_SIZE +
            '.',
        );
        eventName = eventName.substring(0, MAX_VALUE_SIZE);
      }
      if (typeof value === 'string' && shouldTrimParam(value, MAX_VALUE_SIZE)) {
        this.outputLogger.warn(
          'statsigSDK::logEvent> value is too long, trimming to ' +
            MAX_VALUE_SIZE +
            '.',
        );
        value = value.substring(0, MAX_VALUE_SIZE);
      }

      if (shouldTrimParam(metadata, MAX_OBJ_SIZE)) {
        this.outputLogger.warn(
          'statsigSDK::logEvent> metadata is too big. Dropping the metadata.',
        );
        metadata = { statsig_error: 'Metadata length too large' };
      }

      let event = new LogEvent(eventName);
      event.setUser(user);
      event.setValue(value);
      event.setMetadata(metadata);

      if (typeof time === 'number') {
        event.setTime(time);
      }

      this._logger.log(event);
    });
  }

  /**
   * Informs the statsig SDK that the server is closing or shutting down
   * so the SDK can clean up internal state
   */
  public shutdown() {
    if (this._logger == null) {
      return;
    }

    this._errorBoundary.swallow(() => {
      this._ready = false;
      this._logger.shutdown();
      this._fetcher.shutdown();
      this._evaluator.shutdown();
    });
  }

  public async flush(): Promise<void> {
    return this._errorBoundary.capture(
      () => {
        if (this._logger == null) {
          return Promise.resolve();
        }

        return this._logger.flush();
      },
      () => Promise.resolve(),
    );
  }

  public getClientInitializeResponse(
    user: StatsigUser,
    clientSDKKey?: string,
  ): Record<string, unknown> | null {
    return this._errorBoundary.capture(
      () => {
        if (this._ready !== true) {
          throw new StatsigUninitializedError();
        }
        let normalizedUser = user;
        if (user.statsigEnvironment == null) {
          normalizedUser = normalizeUser(user, this._options);
        }
        return this._evaluator.getClientInitializeResponse(
          normalizedUser,
          clientSDKKey,
        );
      },
      () => null,
    );
  }

  public overrideGate(
    gateName: string,
    value: boolean,
    userID: string | null = '',
  ) {
    this._errorBoundary.swallow(() => {
      if (typeof value !== 'boolean') {
        this.outputLogger.warn(
          'statsigSDK> Attempted to override a gate with a non boolean value',
        );
        return;
      }
      this._evaluator.overrideGate(gateName, value, userID);
    });
  }

  public overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userID: string | null = '',
  ) {
    this._errorBoundary.swallow(() => {
      if (typeof value !== 'object') {
        this.outputLogger.warn(
          'statsigSDK> Attempted to override a config with a non object value',
        );
        return;
      }
      this._evaluator.overrideConfig(configName, value, userID);
    });
  }

  public overrideLayer(
    layerName: string,
    value: Record<string, unknown>,
    userID: string | null = '',
  ) {
    this._errorBoundary.swallow(() => {
      if (typeof value !== 'object') {
        this.outputLogger.warn(
          'statsigSDK> Attempted to override a layer with a non object value',
        );
        return;
      }
      this._evaluator.overrideLayer(layerName, value, userID);
    });
  }

  public getFeatureGateList(): string[] {
    return this._evaluator.getFeatureGateList();
  }

  public getExperimentList(): string[] {
    return this._evaluator.getExperimentList();
  }

  //
  // PRIVATE
  //

  private logGateExposureImpl(
    user: StatsigUser,
    gateName: string,
    evaluation: ConfigEvaluation,
    exposureCause: ExposureCause,
  ) {
    this._logger.logGateExposure(
      user,
      gateName,
      evaluation,
      exposureCause === ExposureCause.Manual,
    );
  }

  private getGateImpl(
    inputUser: StatsigUser,
    gateName: string,
    exposureLogging: ExposureLogging,
    willCallerFallbackToServer: boolean,
  ): GetGateImplResponse {
    const { error, normalizedUser: user } = this._validateInputs(
      inputUser,
      gateName,
    );

    if (error) {
      return {
        type: 'error',
        error: error,
      };
    }

    const evaluation = this._evaluator.checkGate(user, gateName);

    if (evaluation.fetch_from_server) {
      if (willCallerFallbackToServer) {
        return {
          type: 'fallback',
        };
      }

      evaluation.rule_id = 'fallback_disabled';
    }

    if (exposureLogging !== ExposureLogging.Disabled) {
      this.logGateExposureImpl(
        user,
        gateName,
        evaluation,
        ExposureCause.Automatic,
      );
    }

    return {
      type: 'valid',
      gate: makeFeatureGate(
        gateName,
        evaluation.rule_id,
        evaluation.value === true,
        evaluation.group_name,
      ),
    };
  }

  private async getGateImplWithServerFallback(
    inputUser: StatsigUser,
    gateName: string,
    exposureLogging: ExposureLogging,
  ): Promise<FeatureGate> {
    const result = this.getGateImpl(inputUser, gateName, exposureLogging, true);

    switch (result.type) {
      case 'valid':
        return result.gate;
      case 'error':
        return Promise.reject(result.error);
      case 'fallback':
        const res = await this._fetcher.dispatch(
          this._options.api + '/check_gate',
          Object.assign({
            user: inputUser,
            gateName: gateName,
            statsigMetadata: getStatsigMetadata({
              exposureLoggingDisabled:
                exposureLogging === ExposureLogging.Disabled,
            }),
          }),
          5000,
        );
        return await res.json();
    }
  }

  private logConfigExposureImpl(
    user: StatsigUser,
    configName: string,
    evaluation: ConfigEvaluation,
    exposureCause: ExposureCause,
  ) {
    this._logger.logConfigExposure(
      user,
      configName,
      evaluation,
      exposureCause === ExposureCause.Manual,
    );
  }

  private getConfigImpl(
    inputUser: StatsigUser,
    configName: string,
    exposureLogging: ExposureLogging,
  ): Promise<DynamicConfig> {
    const { rejection, normalizedUser: user } =
      this._validateInputsForAsyncMethods(inputUser, configName);

    if (rejection) {
      return rejection;
    }

    const evaluation = this._evaluator.getConfig(user, configName);
    if (evaluation.fetch_from_server) {
      return this._fetchConfig(user, configName, exposureLogging);
    }

    const config = new DynamicConfig(
      configName,
      evaluation.json_value as Record<string, unknown>,
      evaluation.rule_id,
      evaluation.group_name,
      evaluation.secondary_exposures,
      evaluation.rule_id !== ''
        ? this._makeOnDefaultValueFallbackFunction(user)
        : null,
    );

    if (exposureLogging !== ExposureLogging.Disabled) {
      this.logConfigExposureImpl(
        user,
        configName,
        evaluation,
        ExposureCause.Automatic,
      );
    }

    return Promise.resolve(config);
  }

  private async getLayerImpl(
    inputUser: StatsigUser,
    layerName: string,
    exposureLogging: ExposureLogging,
  ): Promise<Layer> {
    const { rejection, normalizedUser: user } =
      this._validateInputsForAsyncMethods(inputUser, layerName);

    if (rejection) {
      return rejection;
    }

    const ret = this._evaluator.getLayer(user, layerName);

    if (!ret.fetch_from_server) {
      const logFunc = (layer: Layer, parameterName: string) => {
        this.logLayerParameterExposureImpl(
          user,
          layerName,
          parameterName,
          ret,
          ExposureCause.Automatic,
        );
      };
      const layer = new Layer(
        layerName,
        ret?.json_value as Record<string, unknown>,
        ret?.rule_id,
        ret?.group_name,
        ret?.config_delegate,
        exposureLogging === ExposureLogging.Disabled ? null : logFunc,
      );

      return Promise.resolve(layer);
    }

    if (ret.config_delegate) {
      try {
        const config = await this._fetchConfig(
          user,
          ret.config_delegate,
          exposureLogging,
        );
        return await Promise.resolve(
          new Layer(
            layerName,
            config?.value,
            config?.getRuleID(),
            config?.getGroupName(),
            ret.config_delegate,
          ),
        );
      } catch {
        return await Promise.resolve(new Layer(layerName));
      }
    }

    return Promise.resolve(new Layer(layerName));
  }

  private logLayerParameterExposureImpl(
    user: StatsigUser,
    layerName: string,
    parameterName: string,
    evaluation: ConfigEvaluation,
    exposureCause: ExposureCause,
  ) {
    if (this._logger == null) {
      return;
    }

    this._logger.logLayerExposure(
      user,
      layerName,
      parameterName,
      evaluation,
      exposureCause === ExposureCause.Manual,
    );
  }

  private _validateInputsForAsyncMethods(
    user: StatsigUser,
    configName: string,
  ) {
    const validation = this._validateInputs(user, configName);
    return {
      rejection: validation.error ? Promise.reject(validation.error) : null,
      normalizedUser: validation.normalizedUser,
    };
  }

  private _validateInputs(user: StatsigUser, configName: string) {
    const result: {
      error: null | Error;
      normalizedUser: StatsigUser;
    } = { error: null, normalizedUser: { userID: '' } };
    if (this._ready !== true) {
      result.error = new StatsigUninitializedError();
    } else if (typeof configName !== 'string' || configName.length === 0) {
      result.error = new StatsigInvalidArgumentError(
        'Lookup key must be a non-empty string',
      );
    } else if (!isUserIdentifiable(user)) {
      result.error = new StatsigInvalidArgumentError(
        'Must pass a valid user with a userID or customID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
      );
    } else {
      result.normalizedUser = normalizeUser(user, this._options);
    }

    const resetError = this._evaluator.resetSyncTimerIfExited();
    if (resetError != null) {
      this._errorBoundary.logError(resetError, 'reset_sync_time');
    }

    return result;
  }

  private _fetchConfig(
    user: StatsigUser,
    name: string,
    exposureLogging: ExposureLogging,
  ): Promise<DynamicConfig> {
    return this._fetcher
      .dispatch(
        this._options.api + '/get_config',
        {
          user: user,
          configName: name,
          statsigMetadata: getStatsigMetadata({
            exposureLoggingDisabled:
              exposureLogging === ExposureLogging.Disabled,
          }),
        },
        5000,
      )
      .then((res) => {
        // @ts-ignore
        return res.json();
      })
      .then((resJSON) => {
        return Promise.resolve(
          new DynamicConfig(
            name,
            resJSON.value,
            resJSON.rule_id,
            resJSON.group_name,
            [],
            this._makeOnDefaultValueFallbackFunction(user),
          ),
        );
      })
      .catch(() => {
        return Promise.resolve(new DynamicConfig(name));
      });
  }

  private _makeOnDefaultValueFallbackFunction(
    user: StatsigUser,
  ): OnDefaultValueFallback | null {
    if (!this._ready) {
      return null;
    }

    return (config, parameter, defaultValueType, valueType) => {
      this._logger.logConfigDefaultValueFallback(
        user,
        `Parameter ${parameter} is a value of type ${valueType}.
      Returning requested defaultValue type ${defaultValueType}`,
        {
          name: config.name,
          ruleID: config.getRuleID(),
          parameter,
          defaultValueType,
          valueType,
        },
      );
    };
  }
}

function shouldTrimParam(
  param: object | string | number | null | unknown,
  size: number,
): boolean {
  if (param == null) return false;
  if (typeof param === 'string') return param.length > size;
  if (typeof param === 'object') {
    return approximateObjectSize(param) > size;
  }
  if (typeof param === 'number') return param.toString().length > size;
  return false;
}

function approximateObjectSize(x: object): number {
  let size = 0;
  const entries = Object.entries(x);
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i][0];
    const value = entries[i][1] as unknown;
    if (typeof value === 'object' && value !== null) {
      size += approximateObjectSize(value);
    } else {
      size += String(value).length;
    }
    size += key.length;
  }
  return size;
}

function normalizeUser(
  user: StatsigUser,
  options: ExplicitStatsigOptions,
): StatsigUser {
  user = trimUserObjIfNeeded(user);
  user = JSON.parse(JSON.stringify(user));
  if (options?.environment != null) {
    user['statsigEnvironment'] = options?.environment;
  }
  return user;
}

function trimUserObjIfNeeded(user: StatsigUser): StatsigUser {
  if (user == null) return { customIDs: {} }; // Being defensive here

  if (user.userID != null && shouldTrimParam(user.userID, MAX_VALUE_SIZE)) {
    OutputLogger.getLogger().warn(
      'statsigSDK> User ID is too large, trimming to ' + MAX_VALUE_SIZE,
    );
    user.userID = user.userID.toString().substring(0, MAX_VALUE_SIZE);
  }

  if (shouldTrimParam(user, MAX_USER_SIZE)) {
    user.custom = { statsig_error: 'User object length too large' };
    if (shouldTrimParam(user, MAX_USER_SIZE)) {
      OutputLogger.getLogger().warn(
        'statsigSDK> User object is too large, only keeping the user ID.',
      );
      user = { userID: user.userID, customIDs: user.customIDs ?? {} };
    } else {
      OutputLogger.getLogger().warn(
        'statsigSDK> User object is too large, dropping the custom property.',
      );
    }
  }
  return user;
}
