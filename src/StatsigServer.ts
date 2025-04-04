import { v4 as uuidv4 } from 'uuid';

import ConfigEvaluation from './ConfigEvaluation';
import Diagnostics from './Diagnostics';
import DynamicConfig, { OnDefaultValueFallback } from './DynamicConfig';
import ErrorBoundary from './ErrorBoundary';
import {
  StatsigInvalidArgumentError,
  StatsigUninitializedError,
} from './Errors';
import Evaluator, { ClientInitializeResponse } from './Evaluator';
import {
  FeatureGate,
  makeEmptyFeatureGate,
  makeFeatureGate,
} from './FeatureGate';
import { InitializationDetails } from './InitializationDetails';
import { UserPersistedValues } from './interfaces/IUserPersistentStorage';
import Layer from './Layer';
import LogEvent from './LogEvent';
import LogEventProcessor from './LogEventProcessor';
import OutputLogger from './OutputLogger';
import SpecStore from './SpecStore';
import {
  CheckGateOptions,
  ExplicitStatsigOptions,
  GetConfigOptions,
  GetExperimentOptions,
  GetLayerOptions,
  OptionsLoggingCopy,
  OptionsWithDefaults,
  StatsigOptions,
} from './StatsigOptions';
import { StatsigUser } from './StatsigUser';
import asyncify from './utils/asyncify';
import { isUserIdentifiable, notEmptyObject } from './utils/core';
import type { HashingAlgorithm } from './utils/Hashing';
import LogEventValidator from './utils/LogEventValidator';
import { InitializeContext, StatsigContext } from './utils/StatsigContext';
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
  overrides?: {
    gates?: Record<string, boolean>;
    experimentsByGroupName?: Record<string, string>;
  };
};

/**
 * The global statsig class for interacting with gates, configs, experiments configured in the statsig developer console.  Also used for event logging to view in the statsig console, or for analyzing experiment impacts using pulse.
 */
export default class StatsigServer {
  private _pendingInitPromise: Promise<InitializeContext> | null = null;
  private _ready = false;
  private _options: ExplicitStatsigOptions;
  private _logger: LogEventProcessor;
  private _secretKey: string;
  private _evaluator: Evaluator;
  private _fetcher: StatsigFetcher;
  private _errorBoundary: ErrorBoundary;
  private _sessionID: string;
  private _store: SpecStore;

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
    this._store = new SpecStore(this._secretKey, this._fetcher, this._options);
    this._evaluator = new Evaluator(this._options, this._store);
  }

  public async initializeAsync(): Promise<InitializationDetails> {
    const res = await this.initializeImpl();
    return res.getInitDetails();
  }

  /**
   * Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.
   * @throws Error if a Server Secret Key is not provided
   */
  private async initializeImpl(): Promise<InitializeContext> {
    return this._errorBoundary.capture(
      (ctx) => {
        if (this._pendingInitPromise != null) {
          return this._pendingInitPromise;
        }

        if (this._ready === true) {
          return Promise.resolve(ctx);
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

        const initPromise = this._evaluator
          .init(ctx)
          .then(() => Promise.resolve(ctx))
          .finally(() => {
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
            new Promise<InitializeContext>((resolve) => {
              setTimeout(() => {
                Diagnostics.mark.overall.end({
                  success: false,
                  reason: 'timeout',
                });
                Diagnostics.logDiagnostics('initialize');
                Diagnostics.setContext('config_sync');
                this._ready = true;
                this._pendingInitPromise = null;
                ctx.setFailed(new Error('Timed out waiting for initialize'));
                resolve(ctx);
              }, this._options.initTimeoutMs);
            }),
          ]);
        } else {
          this._pendingInitPromise = initPromise;
        }
        return this._pendingInitPromise ?? Promise.resolve(ctx);
      },
      (ctx, err) => {
        this._ready = true;
        this._pendingInitPromise = null;
        ctx.setFailed(err instanceof Error ? err : undefined);
        return Promise.resolve(ctx);
      },
      InitializeContext.new({
        caller: 'initializeAsync',
        sdkKey: this._secretKey,
      }),
    );
  }

  // #region Check Gate

  /**
   * Check the value of a gate configured in the statsig console
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  public checkGate(
    user: StatsigUser,
    gateName: string,
    options?: CheckGateOptions,
  ): boolean {
    return this.getFeatureGate(user, gateName, options).value;
  }

  public getFeatureGate(
    user: StatsigUser,
    gateName: string,
    options?: CheckGateOptions,
  ): FeatureGate {
    const res = this._errorBoundary.capture(
      (ctx) =>
        this.getGateImpl(
          user,
          gateName,
          options?.disableExposureLogging == true
            ? ExposureLogging.Disabled
            : ExposureLogging.Enabled,
          ctx,
        ),
      () => makeEmptyFeatureGate(gateName),
      StatsigContext.new({ caller: 'checkGate', configName: gateName }),
    );

    if (this._options.evaluationCallback != null) {
      this._options.evaluationCallback(res);
    }
    return res;
  }

  public logGateExposure(inputUser: StatsigUser, gateName: string) {
    return this._errorBoundary.swallow(
      (ctx) => {
        const { evaluation, user } = this.evalGate(inputUser, gateName, ctx);
        this.logGateExposureImpl(
          user,
          gateName,
          evaluation,
          ExposureCause.Manual,
        );
      },
      StatsigContext.new({ caller: 'logGateExposure', configName: gateName }),
    );
  }

  //#endregion

  // #region Get Config
  /**
   * Checks the value of a config for a given user
   */
  public getConfig(
    user: StatsigUser,
    configName: string,
    options?: GetConfigOptions,
  ): DynamicConfig {
    const res = this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(
          user,
          configName,
          options?.disableExposureLogging == true
            ? ExposureLogging.Disabled
            : ExposureLogging.Enabled,
          ctx,
        ),
      () => new DynamicConfig(configName),
      StatsigContext.new({ caller: 'getConfig', configName: configName }),
    );

    if (this._options.evaluationCallback != null) {
      this._options.evaluationCallback(res);
    }
    return res;
  }

  public logConfigExposure(inputUser: StatsigUser, experimentName: string) {
    this._errorBoundary.swallow(
      (ctx) => {
        const { evaluation, user } = this.evalConfig(
          inputUser,
          experimentName,
          ctx,
        );
        this.logConfigExposureImpl(
          user,
          experimentName,
          evaluation,
          ExposureCause.Manual,
        );
      },
      StatsigContext.new({
        caller: 'logConfigExposure',
        configName: experimentName,
      }),
    );
  }

  //#endregion

  // #region Get Experiment

  /**
   * Checks the value of a config for a given user
   * @throws Error if initialize() was not called first
   * @throws Error if the experimentName is not provided or not a non-empty string
   */
  public getExperiment(
    user: StatsigUser,
    experimentName: string,
    options?: GetExperimentOptions,
  ): DynamicConfig {
    const res = this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(
          user,
          experimentName,
          options?.disableExposureLogging == true
            ? ExposureLogging.Disabled
            : ExposureLogging.Enabled,
          ctx,
          true, // isExperiment
        ),
      () => new DynamicConfig(experimentName),
      StatsigContext.new({
        caller: 'getExperiment',
        configName: experimentName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );

    if (this._options?.evaluationCallback != null) {
      this._options.evaluationCallback(res);
    }
    return res;
  }

  public logExperimentExposure(inputUser: StatsigUser, experimentName: string) {
    this._errorBoundary.swallow(
      (ctx) => {
        const { evaluation, user } = this.evalConfig(
          inputUser,
          experimentName,
          ctx,
        );
        this.logConfigExposureImpl(
          user,
          experimentName,
          evaluation,
          ExposureCause.Manual,
        );
      },
      StatsigContext.new({
        caller: 'logExperimentExposure',
        configName: experimentName,
      }),
    );
  }

  public getExperimentLayer(experiment: string): string | null {
    return this._errorBoundary.capture(
      () => {
        return this._evaluator.getExperimentLayer(experiment);
      },
      () => null,
      StatsigContext.new({
        caller: 'getExperimentLayer',
        configName: experiment,
      }),
    );
  }

  //#endregion

  // #region Get Layer

  /**
   * Checks the value of a config for a given user
   * @throws Error if initialize() was not called first
   * @throws Error if the layerName is not provided or not a non-empty string
   */
  public getLayer(
    user: StatsigUser,
    layerName: string,
    options?: GetLayerOptions,
  ): Layer {
    const res = this._errorBoundary.capture(
      (ctx) =>
        this.getLayerImpl(
          user,
          layerName,
          options?.disableExposureLogging == true
            ? ExposureLogging.Disabled
            : ExposureLogging.Enabled,
          ctx,
        ),
      () => new Layer(layerName),
      StatsigContext.new({
        caller: 'getLayer',
        configName: layerName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );

    if (this._options.evaluationCallback != null) {
      this._options.evaluationCallback(res);
    }
    return res;
  }

  public logLayerParameterExposure(
    inputUser: StatsigUser,
    layerName: string,
    parameterName: string,
  ) {
    this._errorBoundary.swallow(
      (ctx) => {
        const { evaluation, user } = this.evalLayer(inputUser, layerName, ctx);
        this.logLayerParameterExposureImpl(
          user,
          layerName,
          parameterName,
          evaluation,
          ExposureCause.Manual,
        );
      },
      StatsigContext.new({
        caller: 'logLayerParameterExposure',
        configName: layerName,
      }),
    );
  }

  //#endregion

  public getUserPersistedValues(
    user: StatsigUser,
    idType: string,
  ): UserPersistedValues {
    return this._errorBoundary.capture(
      () => this._evaluator.getUserPersistedValues(user, idType),
      () => ({}),
      StatsigContext.new({ caller: 'getUserPersistedValues' }),
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
    return this._errorBoundary.swallow(
      () =>
        this.logEventObject({
          eventName: eventName,
          user: user,
          value: value,
          metadata: metadata,
        }),
      StatsigContext.new({ caller: 'logEvent' }),
    );
  }

  public logEventObject(eventObject: LogEventObject) {
    return this._errorBoundary.swallow(
      () => {
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
        user = this._normalizeUser(user, this._options);

        const event = new LogEvent(eventName);
        event.setUser(user);
        event.setValue(value);
        event.setMetadata(metadata);

        if (typeof time === 'number') {
          event.setTime(time);
        }

        this._logger.log(event);
      },
      StatsigContext.new({ caller: 'logEventObject' }),
    );
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
      StatsigContext.new({ caller: 'shutdown' }),
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
      StatsigContext.new({ caller: 'shutdownAsync' }),
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
            .flush(true, controller.signal)
            .then(() => clearTimeout(handle));
        } else {
          flushPromise = this._logger.flush(false);
        }
        return flushPromise;
      },
      () => Promise.resolve(),
      StatsigContext.new({ caller: 'flush' }),
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
  ): ClientInitializeResponse | null {
    let markerID = '';
    return this._errorBoundary.capture(
      (ctx) => {
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
          normalizedUser = this._normalizeUser(user, this._options);
        }
        const response = this._evaluator.getClientInitializeResponse(
          normalizedUser,
          ctx,
          clientSDKKey,
          options,
        );
        const invalidResponse =
          response == null ||
          (!notEmptyObject(response.feature_gates) &&
            !notEmptyObject(response.dynamic_configs) &&
            !notEmptyObject(response.layer_configs));
        if (invalidResponse) {
          this._errorBoundary.logError(
            new Error('getClientInitializeResponse returns empty response'),
            ctx,
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
      StatsigContext.new({
        caller: 'getClientInitializeResponse',
        clientKey: clientSDKKey,
        hash: options?.hash,
      }),
    );
  }

  public overrideGate(
    gateName: string,
    value: boolean,
    userOrCustomID: string | null = '',
  ) {
    this._errorBoundary.swallow(
      () => {
        if (typeof value !== 'boolean') {
          OutputLogger.warn(
            'statsigSDK> Attempted to override a gate with a non boolean value',
          );
          return;
        }
        this._evaluator.overrideGate(gateName, value, userOrCustomID);
      },
      StatsigContext.new({ caller: 'overrideGate' }),
    );
  }

  public overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userOrCustomID: string | null = '',
  ) {
    this._errorBoundary.swallow(
      () => {
        if (typeof value !== 'object') {
          OutputLogger.warn(
            'statsigSDK> Attempted to override a config with a non object value',
          );
          return;
        }
        this._evaluator.overrideConfig(configName, value, userOrCustomID);
      },
      StatsigContext.new({ caller: 'overrideConfig' }),
    );
  }

  public overrideLayer(
    layerName: string,
    value: Record<string, unknown>,
    userOrCustomID: string | null = '',
  ) {
    this._errorBoundary.swallow(
      () => {
        if (typeof value !== 'object') {
          OutputLogger.warn(
            'statsigSDK> Attempted to override a layer with a non object value',
          );
          return;
        }
        this._evaluator.overrideLayer(layerName, value, userOrCustomID);
      },
      StatsigContext.new({ caller: 'overrideLayer' }),
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

  //#region Deprecated _sync and withExposureDisabled Methods
  /**
   * @deprecated Please use checkGate instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public checkGateSync(user: StatsigUser, gateName: string): boolean {
    return this.getFeatureGateSync(user, gateName).value;
  }

  /**
   * @deprecated Please use getFeatureGate instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getFeatureGateSync(user: StatsigUser, gateName: string): FeatureGate {
    return this._errorBoundary.capture(
      (ctx) => this.getGateImpl(user, gateName, ExposureLogging.Enabled, ctx),
      () => makeEmptyFeatureGate(gateName),
      StatsigContext.new({ caller: 'checkGate', configName: gateName }),
    );
  }

  /**
   * @deprecated Please use checkGate() with CheckGateOptions instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public checkGateWithExposureLoggingDisabledSync(
    user: StatsigUser,
    gateName: string,
  ): boolean {
    return this.getFeatureGateWithExposureLoggingDisabledSync(user, gateName)
      .value;
  }

  /**
   * @deprecated Please use getFeatureGate with CheckGateOptions instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getFeatureGateWithExposureLoggingDisabledSync(
    user: StatsigUser,
    gateName: string,
  ): FeatureGate {
    return this._errorBoundary.capture(
      (ctx) => this.getGateImpl(user, gateName, ExposureLogging.Disabled, ctx),
      () => makeEmptyFeatureGate(gateName),
      StatsigContext.new({
        caller: 'getFeatureGateWithExposureLoggingDisabled',
        configName: gateName,
      }),
    );
  }

  /**
   * @deprecated Please use getConfig instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getConfigSync(user: StatsigUser, configName: string): DynamicConfig {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(user, configName, ExposureLogging.Enabled, ctx),
      () => new DynamicConfig(configName),
      StatsigContext.new({ caller: 'getConfig', configName: configName }),
    );
  }

  /**
   * @deprecated Please use getConfigWithExposureLoggingDisabled instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getConfigWithExposureLoggingDisabledSync(
    user: StatsigUser,
    configName: string,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(user, configName, ExposureLogging.Disabled, ctx),
      () => new DynamicConfig(configName),
      StatsigContext.new({
        caller: 'getConfigWithExposureLoggingDisabled',
        configName: configName,
      }),
    );
  }

  /**
   * @deprecated Please use getExperiment instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getExperimentSync(
    user: StatsigUser,
    experimentName: string,
    options?: GetExperimentOptions,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(user, experimentName, ExposureLogging.Enabled, ctx),
      () => new DynamicConfig(experimentName),
      StatsigContext.new({
        caller: 'getExperiment',
        configName: experimentName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );
  }

  /**
   * @deprecated Please use getExperimentWithExposureLoggingDisabled instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getExperimentWithExposureLoggingDisabledSync(
    user: StatsigUser,
    experimentName: string,
    options?: GetExperimentOptions,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(user, experimentName, ExposureLogging.Disabled, ctx),
      () => new DynamicConfig(experimentName),
      StatsigContext.new({
        caller: 'getExperimentWithExposureLoggingDisabled',
        configName: experimentName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );
  }

  /**
   * @deprecated Please use getLayer instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getLayerSync(
    user: StatsigUser,
    layerName: string,
    options?: GetLayerOptions,
  ): Layer {
    return this._errorBoundary.capture(
      (ctx) => this.getLayerImpl(user, layerName, ExposureLogging.Enabled, ctx),
      () => new Layer(layerName),
      StatsigContext.new({
        caller: 'getLayer',
        configName: layerName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );
  }

  /**
   * @deprecated Please use getLayer with GetLayerOptions instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public getLayerWithExposureLoggingDisabledSync(
    user: StatsigUser,
    layerName: string,
    options?: GetLayerOptions,
  ): Layer {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getLayerImpl(user, layerName, ExposureLogging.Disabled, ctx),
      () => new Layer(layerName),
      StatsigContext.new({
        caller: 'getLayerWithExposureLoggingDisabled',
        configName: layerName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );
  }

  /**
   * @deprecated Please use checkGate with CheckGateOptions instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  public checkGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): boolean {
    return this.getFeatureGateWithExposureLoggingDisabled(user, gateName).value;
  }

  /**
   * @deprecated use getFeatureGate() with CheckGateOptions instead
   */
  public getFeatureGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): FeatureGate {
    return this._errorBoundary.capture(
      (ctx) => this.getGateImpl(user, gateName, ExposureLogging.Disabled, ctx),
      () => makeEmptyFeatureGate(gateName),
      StatsigContext.new({
        caller: 'getFeatureGateWithExposureLoggingDisabled',
        configName: gateName,
      }),
    );
  }

  /**
   * @deprecated use getConfig() with GetConfigOptions instead
   */
  public getConfigWithExposureLoggingDisabled(
    user: StatsigUser,
    configName: string,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(user, configName, ExposureLogging.Disabled, ctx),
      () => new DynamicConfig(configName),
      StatsigContext.new({
        caller: 'getConfigWithExposureLoggingDisabled',
        configName: configName,
      }),
    );
  }

  /**
   * @deprecated use getExperiment() with GetExperimentOptions instead
   * GetExperimentOptions.disableExposureDisabled will be ignored
   */
  public getExperimentWithExposureLoggingDisabled(
    user: StatsigUser,
    experimentName: string,
    options?: GetExperimentOptions,
  ): DynamicConfig {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getConfigImpl(user, experimentName, ExposureLogging.Disabled, ctx),
      () => new DynamicConfig(experimentName),
      StatsigContext.new({
        caller: 'getExperimentWithExposureLoggingDisabled',
        configName: experimentName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );
  }

  /**
   * @deprecated use getLayer() with GetLayerOptions instead
   * GetLayerOptions.disableExposureDisabled will be ignored
   */
  public getLayerWithExposureLoggingDisabled(
    user: StatsigUser,
    layerName: string,
    options?: GetLayerOptions,
  ): Layer {
    return this._errorBoundary.capture(
      (ctx) =>
        this.getLayerImpl(user, layerName, ExposureLogging.Disabled, ctx),
      () => new Layer(layerName),
      StatsigContext.new({
        caller: 'getLayerWithExposureLoggingDisabled',
        configName: layerName,
        userPersistedValues: options?.userPersistedValues,
        persistentAssignmentOptions: options?.persistentAssignmentOptions,
      }),
    );
  }
  //#endregion

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
    ctx: StatsigContext,
  ): NormalizedEvaluation {
    const { error, normalizedUser: user } = this._validateInputs(
      inputUser,
      gateName,
    );

    if (error) {
      throw error;
    }

    return {
      evaluation: this._evaluator.checkGate(user, gateName, ctx),
      user: user,
    };
  }

  private getGateImpl(
    inputUser: StatsigUser,
    gateName: string,
    exposureLogging: ExposureLogging,
    ctx: StatsigContext,
  ): FeatureGate {
    const { evaluation, user } = this.evalGate(inputUser, gateName, ctx);
    if (exposureLogging !== ExposureLogging.Disabled) {
      this.logGateExposureImpl(
        user,
        gateName,
        evaluation,
        ExposureCause.Automatic,
      );
    }

    const gate = makeFeatureGate(
      gateName,
      evaluation.rule_id,
      evaluation.value === true,
      evaluation.group_name,
      evaluation.id_type,
      evaluation.evaluation_details ?? null,
    );

    if (this._options.evaluationCallbacks?.gateCallback != null) {
      this._options.evaluationCallbacks.gateCallback(
        gate,
        user,
        this._logger.getGateExposure(user, gateName, evaluation, true),
      );
    }
    return gate;
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
    ctx: StatsigContext,
  ): NormalizedEvaluation {
    const { error, normalizedUser: user } = this._validateInputs(
      inputUser,
      configName,
    );

    if (error) {
      throw error;
    }

    const evaluation = this._evaluator.getConfig(user, configName, ctx);
    return {
      evaluation,
      user,
    };
  }

  private getConfigImpl(
    inputUser: StatsigUser,
    configName: string,
    exposureLogging: ExposureLogging,
    ctx: StatsigContext,
    isExperiment = false,
  ): DynamicConfig {
    const { evaluation, user } = this.evalConfig(inputUser, configName, ctx);
    const config = new DynamicConfig(
      configName,
      evaluation.json_value,
      evaluation.rule_id,
      evaluation.group_name,
      evaluation.id_type,
      evaluation.secondary_exposures,
      evaluation.rule_id !== ''
        ? this._makeOnDefaultValueFallbackFunction(user)
        : null,
      evaluation.evaluation_details ?? null,
    );

    if (exposureLogging !== ExposureLogging.Disabled) {
      this.logConfigExposureImpl(
        user,
        configName,
        evaluation,
        ExposureCause.Automatic,
      );
    }

    const callback = isExperiment
      ? this._options.evaluationCallbacks?.experimentCallback
      : this._options.evaluationCallbacks?.dynamicConfigCallback;

    if (callback != null) {
      callback(
        config,
        user,
        this._logger.getConfigExposure(user, configName, evaluation, true),
      );
    }

    return config;
  }

  private evalLayer(
    inputUser: StatsigUser,
    layerName: string,
    ctx: StatsigContext,
  ): NormalizedEvaluation {
    const { error, normalizedUser: user } = this._validateInputs(
      inputUser,
      layerName,
    );

    if (error) {
      throw error;
    }

    const evaluation = this._evaluator.getLayer(user, layerName, ctx);
    return {
      evaluation: evaluation,
      user: user,
    };
  }

  private getLayerImpl(
    inputUser: StatsigUser,
    layerName: string,
    exposureLogging: ExposureLogging,
    ctx: StatsigContext,
  ): Layer {
    const { evaluation, user } = this.evalLayer(inputUser, layerName, ctx);
    const logFunc = (layer: Layer, parameterName: string) => {
      if (this._options.evaluationCallbacks?.layerParamCallback != null) {
        this._options.evaluationCallbacks.layerParamCallback(
          layer,
          parameterName,
          user,
          this._logger.getLayerExposure(
            user,
            layerName,
            parameterName,
            evaluation,
            true,
          ),
        );
      }
      if (exposureLogging !== ExposureLogging.Disabled) {
        this.logLayerParameterExposureImpl(
          user,
          layerName,
          parameterName,
          evaluation,
          ExposureCause.Automatic,
        );
      }
    };

    const layer = new Layer(
      layerName,
      evaluation?.json_value,
      evaluation?.rule_id,
      evaluation?.group_name,
      evaluation?.config_delegate,
      logFunc,
      evaluation?.evaluation_details,
      evaluation?.id_type,
    );

    if (this._options.evaluationCallbacks?.layerCallback != null) {
      this._options.evaluationCallbacks.layerCallback(layer, user);
    }
    return layer;
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
      result.normalizedUser = this._normalizeUser(user, this._options);
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

  private _normalizeUser(
    user: StatsigUser,
    options: ExplicitStatsigOptions,
  ): StatsigUser {
    if (user == null) {
      user = { customIDs: {} }; // Being defensive here
    }
    if (options?.environment != null) {
      user['statsigEnvironment'] = options?.environment;
    } else {
      const storeEnv = this._store.getDefaultEnvironment();
      if (storeEnv != null) {
        user['statsigEnvironment'] = { tier: storeEnv };
      }
    }
    return user;
  }
}
