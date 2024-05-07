import { v4 as uuidv4 } from 'uuid';

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
  OptionsLoggingCopy,
  OptionsWithDefaults,
  StatsigOptions,
} from './StatsigOptions';
import { StatsigUser } from './StatsigUser';
import asyncify from './utils/asyncify';
import { isUserIdentifiable, notEmptyObject } from './utils/core';
import type { HashingAlgorithm } from './utils/Hashing';
import LogEventValidator from './utils/LogEventValidator';
import StatsigFetcher from './utils/StatsigFetcher';

let hasLoggedNoUserIdWarning = false;

enum ExposureLogging {
  Disabled = 'exposures_disabled',
  Enabled = 'exposures_enabled',
}

enum ExposureCause {
  Automatic = 'automatic_exposure',
  Manual = 'manual_exposure',
}

type NormalizedEvaluation = {
  evaluation: ConfigEvaluation;
  user: StatsigUser;
};

export type LogEventObject = {
  eventName: string;
  user: StatsigUser;
  value?: string | number | null;
  metadata?: Record<string, unknown> | null;
  time?: string | null;
};

export type ClientInitializeResponseOptions = {
  hash?: HashingAlgorithm;
  includeLocalOverrides?: boolean;
};

/**
 * The global statsig class for interacting with gates, configs, experiments configured in the statsig developer console.  Also used for event logging to view in the statsig console, or for analyzing experiment impacts using pulse.
 */
export default class StatsigServer {
  private _pendingInitPromise: Promise<void> | null = null;
  private _ready = false;
  private _options: ExplicitStatsigOptions;
  private _logger: LogEventProcessor;
  private _secretKey: string;
  private _evaluator: Evaluator;
  private _fetcher: StatsigFetcher;
  private _errorBoundary: ErrorBoundary;
  private _sessionID: string;

  public constructor(secretKey: string, options: StatsigOptions = {}) {
    const optionsLoggingcopy = OptionsLoggingCopy(options);
    this._sessionID = uuidv4();
    this._secretKey = secretKey;
    this._options = OptionsWithDefaults(options);
    this._pendingInitPromise = null;
    this._ready = false;
    this._errorBoundary = new ErrorBoundary(
      secretKey,
      optionsLoggingcopy,
      this._sessionID,
    );
    this._fetcher = new StatsigFetcher(
      this._secretKey,
      this._options,
      this._errorBoundary,
      this._sessionID,
    );
    this._logger = new LogEventProcessor(
      this._fetcher,
      this._errorBoundary,
      this._options,
      optionsLoggingcopy,
      this._sessionID,
    );
    Diagnostics.initialize({
      logger: this._logger,
      options: this._options,
    });
    this._evaluator = new Evaluator(this._fetcher, this._options);
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
          !this._options.localMode &&
          (typeof this._secretKey !== 'string' ||
            this._secretKey.length === 0 ||
            !this._secretKey.startsWith('secret-'))
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
            new Promise<void>((resolve) => {
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
            }),
          ]);
        } else {
          this._pendingInitPromise = initPromise;
        }
        return this._pendingInitPromise ?? Promise.resolve();
      },
      () => {
        this._ready = true;
        this._pendingInitPromise = null;
        return Promise.resolve();
      },
      { tag: 'initializeAsync' },
    );
  }

  // #region Check Gate

  /**
   * Check the value of a gate configured in the statsig console
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  public checkGateSync(user: StatsigUser, gateName: string): boolean {
    return this.getFeatureGateSync(user, gateName).value;
  }

  public getFeatureGateSync(user: StatsigUser, gateName: string): FeatureGate {
    return this._errorBoundary.capture(
      () => this.getGateImpl(user, gateName, ExposureLogging.Enabled),
      () => makeEmptyFeatureGate(gateName),
      { configName: gateName, tag: 'checkGate' },
    );
  }

  public checkGateWithExposureLoggingDisabledSync(
    user: StatsigUser,
    gateName: string,
  ): boolean {
    return this.getFeatureGateWithExposureLoggingDisabledSync(user, gateName)
      .value;
  }

  public getFeatureGateWithExposureLoggingDisabledSync(
    user: StatsigUser,
    gateName: string,
  ): FeatureGate {
    return this._errorBoundary.capture(
      () => this.getGateImpl(user, gateName, ExposureLogging.Disabled),
      () => makeEmptyFeatureGate(gateName),
      {
        configName: gateName,
        tag: 'getFeatureGateWithExposureLoggingDisabled',
      },
    );
  }

  public logGateExposure(inputUser: StatsigUser, gateName: string) {
    return this._errorBoundary.swallow(() => {
      const { evaluation, user } = this.evalGate(inputUser, gateName);
      this.logGateExposureImpl(
        user,
        gateName,
        evaluation,
        ExposureCause.Manual,
      );
    });
  }

  //#endregion

  // #region Get Config
  /**
   * Checks the value of a config for a given user
   */
  public getConfigSync(user: StatsigUser, configName: string): DynamicConfig {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, configName, ExposureLogging.Enabled),
      () => new DynamicConfig(configName),
      { configName, tag: 'getConfig' },
    );
  }

  public getConfigWithExposureLoggingDisabledSync(
    user: StatsigUser,
    configName: string,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, configName, ExposureLogging.Disabled),
      () => new DynamicConfig(configName),
      { configName, tag: 'getConfigWithExposureLoggingDisabled' },
    );
  }

  public logConfigExposure(inputUser: StatsigUser, experimentName: string) {
    this._errorBoundary.swallow(() => {
      const { evaluation, user } = this.evalConfig(inputUser, experimentName);
      this.logConfigExposureImpl(
        user,
        experimentName,
        evaluation,
        ExposureCause.Manual,
      );
    });
  }

  //#endregion

  // #region Get Experiment

  /**
   * Checks the value of a config for a given user
   * @throws Error if initialize() was not called first
   * @throws Error if the experimentName is not provided or not a non-empty string
   */
  public getExperimentSync(
    user: StatsigUser,
    experimentName: string,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, experimentName, ExposureLogging.Enabled),
      () => new DynamicConfig(experimentName),
      { configName: experimentName, tag: 'getExperiment' },
    );
  }

  public getExperimentWithExposureLoggingDisabledSync(
    user: StatsigUser,
    experimentName: string,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      () => this.getConfigImpl(user, experimentName, ExposureLogging.Disabled),
      () => new DynamicConfig(experimentName),
      {
        configName: experimentName,
        tag: 'getExperimentWithExposureLoggingDisabled',
      },
    );
  }

  public logExperimentExposure(inputUser: StatsigUser, experimentName: string) {
    this._errorBoundary.swallow(() => {
      const { evaluation, user } = this.evalConfig(inputUser, experimentName);
      this.logConfigExposureImpl(
        user,
        experimentName,
        evaluation,
        ExposureCause.Manual,
      );
    });
  }

  public getExperimentLayer(experiment: string): string | null {
    return this._errorBoundary.capture(
      () => {
        return this._evaluator.getExperimentLayer(experiment);
      },
      () => null,
      { configName: experiment, tag: 'getExperimentLayer' },
    );
  }

  //#endregion

  // #region Get Layer

  /**
   * Checks the value of a config for a given user
   * @throws Error if initialize() was not called first
   * @throws Error if the layerName is not provided or not a non-empty string
   */
  public getLayerSync(user: StatsigUser, layerName: string): Layer {
    return this._errorBoundary.capture(
      () => this.getLayerImpl(user, layerName, ExposureLogging.Enabled),
      () => new Layer(layerName),
      {
        configName: layerName,
        tag: 'getLayer',
      },
    );
  }

  public getLayerWithExposureLoggingDisabledSync(
    user: StatsigUser,
    layerName: string,
  ): Layer {
    return this._errorBoundary.capture(
      () => this.getLayerImpl(user, layerName, ExposureLogging.Disabled),
      () => new Layer(layerName),
      { configName: layerName, tag: 'getLayerWithExposureLoggingDisabled' },
    );
  }

  public logLayerParameterExposure(
    inputUser: StatsigUser,
    layerName: string,
    parameterName: string,
  ) {
    this._errorBoundary.swallow(() => {
      const { evaluation, user } = this.evalLayer(inputUser, layerName);
      this.logLayerParameterExposureImpl(
        user,
        layerName,
        parameterName,
        evaluation,
        ExposureCause.Manual,
      );
    });
  }

  //#endregion

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
    return this._errorBoundary.swallow(
      () =>
        this.logEventObject({
          eventName: eventName,
          user: user,
          value: value,
          metadata: metadata,
        }),
      { tag: 'logEvent' },
    );
  }

  public logEventObject(eventObject: LogEventObject) {
    return this._errorBoundary.swallow(() => {
      const eventName = eventObject.eventName;
      let user = eventObject.user ?? null;
      const value = eventObject.value ?? null;
      const metadata = eventObject.metadata ?? null;
      const time = eventObject.time ?? null;

      if (!(this._ready === true && this._logger != null)) {
        throw new StatsigUninitializedError();
      }
      if (LogEventValidator.validateEventName(eventName) == null) {
        return;
      }
      if (!isUserIdentifiable(user) && !hasLoggedNoUserIdWarning) {
        hasLoggedNoUserIdWarning = true;
        OutputLogger.warn(
          'statsigSDK::logEvent> No valid userID was provided. Event will be logged but not associated with an identifiable user. This message is only logged once.',
        );
      }
      user = normalizeUser(user, this._options);

      const event = new LogEvent(eventName);
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
  public shutdown(timeout?: number) {
    if (this._logger == null) {
      return;
    }

    this._errorBoundary.swallow(
      () => {
        this._ready = false;
        this._logger.shutdown(timeout);
        this._fetcher.shutdown();
        this._evaluator.shutdown();
      },
      {
        tag: 'shutdown',
      },
    );
  }

  /**
   * Informs the statsig SDK that the server is closing or shutting down
   * so the SDK can clean up internal state
   * Ensures any pending promises are resolved and remaining events are flushed.
   */
  public async shutdownAsync(timeout?: number) {
    if (this._logger == null) {
      return;
    }

    await this._errorBoundary.capture(
      async () => {
        this._ready = false;
        await this._logger.shutdown(timeout);
        this._fetcher.shutdown();
        await this._evaluator.shutdownAsync();
      },
      () => Promise.resolve(),
      { tag: 'shutdownAsync' },
    );
  }

  public async flush(timeout?: number): Promise<void> {
    return this._errorBoundary.capture(
      () => {
        if (this._logger == null) {
          return Promise.resolve();
        }

        let flushPromise: Promise<void>;
        if (timeout != null) {
          const controller = new AbortController();
          const handle = setTimeout(() => controller.abort(), timeout);
          flushPromise = this._logger
            .flush(false, controller.signal)
            .then(() => clearTimeout(handle));
        } else {
          flushPromise = this._logger.flush(false);
        }
        return flushPromise;
      },
      () => Promise.resolve(),
      { tag: 'flush' },
    );
  }

  public clearAllGateOverrides(): void {
    this._evaluator.clearAllGateOverrides();
  }

  public clearAllConfigOverrides(): void {
    this._evaluator.clearAllConfigOverrides();
  }

  public clearAllLayerOverrides(): void {
    this._evaluator.clearAllLayerOverrides();
  }

  public async syncStoreSpecs(): Promise<void> {
    await this._evaluator.syncStoreSpecs();
  }

  public async syncStoreIdLists(): Promise<void> {
    await this._evaluator.syncStoreIdLists();
  }

  public getClientInitializeResponse(
    user: StatsigUser,
    clientSDKKey?: string,
    options?: ClientInitializeResponseOptions,
  ): Record<string, unknown> | null {
    let markerID = '';
    return this._errorBoundary.capture(
      () => {
        if (this._ready !== true) {
          throw new StatsigUninitializedError();
        }
        markerID = `gcir_${Diagnostics.getMarkerCount(
          'get_client_initialize_response',
        )}`;
        Diagnostics.mark.getClientInitializeResponse.start(
          { markerID },
          'get_client_initialize_response',
        );
        let normalizedUser = user;
        if (user.statsigEnvironment == null) {
          normalizedUser = normalizeUser(user, this._options);
        }
        const response = this._evaluator.getClientInitializeResponse(
          normalizedUser,
          clientSDKKey,
          options,
        );
        const invalidResponse =
          response == null ||
          (!notEmptyObject(response.feature_gates) &&
            !notEmptyObject(response.dynamic_config) &&
            !notEmptyObject(response.layer_configs));
        if (invalidResponse) {
          this._errorBoundary.logError(
            new Error('getClientInitializeResponse returns empty response'),
            undefined,
            {
              clientKey: clientSDKKey,
              hash: options?.hash,
              tag: 'getClientInitializeResponse',
            },
          );
        }
        Diagnostics.mark.getClientInitializeResponse.end(
          { markerID, success: !invalidResponse },
          'get_client_initialize_response',
        );
        return response;
      },
      () => {
        Diagnostics.mark.getClientInitializeResponse.end(
          { markerID, success: false },
          'get_client_initialize_response',
        );
        return null;
      },
      { tag: 'getClientInitializeResponse' },
    );
  }

  public overrideGate(
    gateName: string,
    value: boolean,
    userID: string | null = '',
  ) {
    this._errorBoundary.swallow(() => {
      if (typeof value !== 'boolean') {
        OutputLogger.warn(
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
    this._errorBoundary.swallow(
      () => {
        if (typeof value !== 'object') {
          OutputLogger.warn(
            'statsigSDK> Attempted to override a config with a non object value',
          );
          return;
        }
        this._evaluator.overrideConfig(configName, value, userID);
      },
      { tag: 'overrideConfig' },
    );
  }

  public overrideLayer(
    layerName: string,
    value: Record<string, unknown>,
    userID: string | null = '',
  ) {
    this._errorBoundary.swallow(
      () => {
        if (typeof value !== 'object') {
          OutputLogger.warn(
            'statsigSDK> Attempted to override a layer with a non object value',
          );
          return;
        }
        this._evaluator.overrideLayer(layerName, value, userID);
      },
      { tag: 'overrideConfig' },
    );
  }

  public getFeatureGateList(): string[] {
    return this._evaluator.getFeatureGateList();
  }

  public getDynamicConfigList(): string[] {
    return this._evaluator.getConfigsList('dynamic_config');
  }

  public getExperimentList(): string[] {
    return this._evaluator.getConfigsList('experiment');
  }

  public getAutotuneList(): string[] {
    return this._evaluator.getConfigsList('autotune');
  }

  public getLayerList(): string[] {
    return this._evaluator.getLayerList();
  }

  //#region Deprecated Async Methods

  /**
   * @deprecated Please use checkGateSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public checkGate(user: StatsigUser, gateName: string): Promise<boolean> {
    return asyncify(() => this.getFeatureGateSync(user, gateName).value);
  }

  /**
   * @deprecated Please use getFeatureGateSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getFeatureGate(
    user: StatsigUser,
    gateName: string,
  ): Promise<FeatureGate> {
    return asyncify(() => this.getFeatureGateSync(user, gateName));
  }

  /**
   * @deprecated Please use checkGateWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public async checkGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): Promise<boolean> {
    return asyncify(
      () =>
        this.getFeatureGateWithExposureLoggingDisabledSync(user, gateName)
          .value,
    );
  }

  /**
   * @deprecated Please use getFeatureGateWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getFeatureGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): Promise<FeatureGate> {
    return asyncify(() =>
      this.getFeatureGateWithExposureLoggingDisabledSync(user, gateName),
    );
  }

  /**
   * @deprecated Please use getConfigSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getConfig(
    user: StatsigUser,
    configName: string,
  ): Promise<DynamicConfig> {
    return asyncify(() => this.getConfigSync(user, configName));
  }

  /**
   * @deprecated Please use getConfigWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getConfigWithExposureLoggingDisabled(
    user: StatsigUser,
    configName: string,
  ): Promise<DynamicConfig> {
    return asyncify(() =>
      this.getConfigWithExposureLoggingDisabledSync(user, configName),
    );
  }

  /**
   * @deprecated Please use getExperimentSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    return asyncify(() => this.getExperimentSync(user, experimentName));
  }

  /**
   * @deprecated Please use getExperimentWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getExperimentWithExposureLoggingDisabled(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    return asyncify(() =>
      this.getExperimentWithExposureLoggingDisabledSync(user, experimentName),
    );
  }

  /**
   * @deprecated Please use getLayerSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getLayer(user: StatsigUser, layerName: string): Promise<Layer> {
    return asyncify(() => this.getLayerSync(user, layerName));
  }

  /**
   * @deprecated Please use getLayerWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getLayerWithExposureLoggingDisabled(
    user: StatsigUser,
    layerName: string,
  ): Promise<Layer> {
    return asyncify(() =>
      this.getLayerWithExposureLoggingDisabledSync(user, layerName),
    );
  }

  //#endregion

  /**
   * Check the value of a gate configured in the statsig console
   * @deprecated Use checkGateSync instead
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public checkGateWithoutServerFallback(
    user: StatsigUser,
    gateName: string,
  ): boolean {
    return this.checkGateSync(user, gateName);
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

  private evalGate(
    inputUser: StatsigUser,
    gateName: string,
  ): NormalizedEvaluation {
    const { error, normalizedUser: user } = this._validateInputs(
      inputUser,
      gateName,
    );

    if (error) {
      throw error;
    }

    return {
      evaluation: this._evaluator.checkGate(user, gateName),
      user: user,
    };
  }

  private getGateImpl(
    inputUser: StatsigUser,
    gateName: string,
    exposureLogging: ExposureLogging,
  ): FeatureGate {
    const { evaluation, user } = this.evalGate(inputUser, gateName);
    if (exposureLogging !== ExposureLogging.Disabled) {
      this.logGateExposureImpl(
        user,
        gateName,
        evaluation,
        ExposureCause.Automatic,
      );
    }

    return makeFeatureGate(
      gateName,
      evaluation.rule_id,
      evaluation.value === true,
      evaluation.group_name,
    );
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

  private evalConfig(
    inputUser: StatsigUser,
    configName: string,
  ): NormalizedEvaluation {
    const { error, normalizedUser: user } = this._validateInputs(
      inputUser,
      configName,
    );

    if (error) {
      throw error;
    }

    const evaluation = this._evaluator.getConfig(user, configName);
    return {
      evaluation,
      user,
    };
  }

  private getConfigImpl(
    inputUser: StatsigUser,
    configName: string,
    exposureLogging: ExposureLogging,
  ): DynamicConfig {
    const { evaluation, user } = this.evalConfig(inputUser, configName);
    const config = new DynamicConfig(
      configName,
      evaluation.json_value,
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

    return config;
  }

  private evalLayer(
    inputUser: StatsigUser,
    layerName: string,
  ): NormalizedEvaluation {
    const { error, normalizedUser: user } = this._validateInputs(
      inputUser,
      layerName,
    );

    if (error) {
      throw error;
    }

    const evaluation = this._evaluator.getLayer(user, layerName);
    return {
      evaluation: evaluation,
      user: user,
    };
  }

  private getLayerImpl(
    inputUser: StatsigUser,
    layerName: string,
    exposureLogging: ExposureLogging,
  ): Layer {
    const { evaluation, user } = this.evalLayer(inputUser, layerName);
    const logFunc = (layer: Layer, parameterName: string) => {
      this.logLayerParameterExposureImpl(
        user,
        layerName,
        parameterName,
        evaluation,
        ExposureCause.Automatic,
      );
    };

    return new Layer(
      layerName,
      evaluation?.json_value,
      evaluation?.rule_id,
      evaluation?.group_name,
      evaluation?.config_delegate,
      exposureLogging === ExposureLogging.Disabled ? null : logFunc,
    );
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

    this._evaluator.resetSyncTimerIfExited();
    return result;
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

function normalizeUser(
  user: StatsigUser,
  options: ExplicitStatsigOptions,
): StatsigUser {
  if (user == null) {
    user = { customIDs: {} }; // Being defensive here
  }
  if (options?.environment != null) {
    user['statsigEnvironment'] = options?.environment;
  }
  return user;
}
