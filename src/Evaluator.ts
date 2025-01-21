import ip3country from 'ip3country';

import ConfigEvaluation from './ConfigEvaluation';
import { ConfigCondition, ConfigRule, ConfigSpec } from './ConfigSpec';
import { EvaluationDetails } from './EvaluationDetails';
import { UserPersistedValues } from './interfaces/IUserPersistentStorage';
import { SecondaryExposure } from './LogEvent';
import OutputLogger from './OutputLogger';
import SpecStore, { APIEntityNames } from './SpecStore';
import { ExplicitStatsigOptions, InitStrategy } from './StatsigOptions';
import { ClientInitializeResponseOptions } from './StatsigServer';
import { StatsigUser } from './StatsigUser';
import UserPersistentStorageHandler from './UserPersistentStorageHandler';
import { cloneEnforce, getSDKType, getSDKVersion } from './utils/core';
import {
  arrayAny,
  arrayHasAllValues,
  arrayHasValue,
  computeUserHash,
  dateCompare,
  getFromEnvironment,
  getFromUser,
  getFromUserAgent,
  getUnitID,
  numberCompare,
  stringCompare,
  versionCompareHelper,
} from './utils/EvaluatorUtils';
import {
  djb2Hash,
  HashingAlgorithm,
  hashString,
  hashUnitIDForIDList,
} from './utils/Hashing';
import {
  EvaluationContext,
  InitializeContext,
  StatsigContext,
} from './utils/StatsigContext';
import StatsigFetcher from './utils/StatsigFetcher';

const CONDITION_SEGMENT_COUNT = 10 * 1000;
const USER_BUCKET_COUNT = 1000;

type InitializeResponse = {
  name: string;
  value: unknown;
  group: string;
  rule_id: string;
  is_device_based: boolean;
  secondary_exposures: Record<string, string>[];
  group_name?: string | null;
  is_experiment_active?: boolean;
  is_user_in_experiment?: boolean;
  is_in_layer?: boolean;
  allocated_experiment_name?: string;
  explicit_parameters?: string[];
  undelegated_secondary_exposures?: Record<string, string>[];
  id_type?: string;
  passed?: boolean;
};

export type ClientInitializeResponse = {
  feature_gates: Record<string, InitializeResponse>;
  dynamic_configs: Record<string, InitializeResponse>;
  layer_configs: Record<string, InitializeResponse>;
  sdkParams: Record<string, unknown>;
  has_updates: boolean;
  generator: 'statsig-node-sdk';
  sdkInfo: { sdkType: string; sdkVersion: string };
  time: number;
  evaluated_keys: Record<string, unknown>;
  hash_used: HashingAlgorithm;
  user: StatsigUser;
};

export default class Evaluator {
  private gateOverrides: Record<string, Record<string, boolean>>;
  private configOverrides: Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  private layerOverrides: Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  private initialized = false;
  private store: SpecStore;
  private persistentStore: UserPersistentStorageHandler;
  private initStrategyForIP3Country: InitStrategy;

  public constructor(options: ExplicitStatsigOptions, store: SpecStore) {
    this.store = store;
    this.initStrategyForIP3Country = options.initStrategyForIP3Country;
    this.gateOverrides = {};
    this.configOverrides = {};
    this.layerOverrides = {};
    this.persistentStore = new UserPersistentStorageHandler(
      options.userPersistentStorage,
    );
  }

  public async init(ctx: InitializeContext): Promise<void> {
    await this.store.init(ctx);
    try {
      if (this.initStrategyForIP3Country === 'lazy') {
        setTimeout(() => {
          ip3country.init();
        }, 0);
      } else if (this.initStrategyForIP3Country !== 'none') {
        ip3country.init();
      }
    } catch (err) {
      // Ignore: this is optional
    }
    this.initialized = true;
  }

  public overrideGate(
    gateName: string,
    value: boolean,
    userOrCustomID: string | null = null,
  ): void {
    const overrides = this.gateOverrides[gateName] ?? {};
    overrides[userOrCustomID == null ? '' : userOrCustomID] = value;
    this.gateOverrides[gateName] = overrides;
  }

  public overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userOrCustomID: string | null = '',
  ): void {
    const overrides = this.configOverrides[configName] ?? {};
    overrides[userOrCustomID == null ? '' : userOrCustomID] = value;
    this.configOverrides[configName] = overrides;
  }

  public overrideLayer(
    layerName: string,
    value: Record<string, unknown>,
    userOrCustomID: string | null = '',
  ): void {
    const overrides = this.layerOverrides[layerName] ?? {};
    overrides[userOrCustomID == null ? '' : userOrCustomID] = value;
    this.layerOverrides[layerName] = overrides;
  }

  public checkGate(
    user: StatsigUser,
    gateName: string,
    ctx: StatsigContext,
  ): ConfigEvaluation {
    const override = this.lookupGateOverride(user, gateName);
    if (override) {
      return override.withEvaluationDetails(
        EvaluationDetails.make(
          this.store.getLastUpdateTime(),
          this.store.getInitialUpdateTime(),
          'LocalOverride',
        ),
      );
    }

    if (this.store.getInitReason() === 'Uninitialized') {
      return new ConfigEvaluation(false).withEvaluationDetails(
        EvaluationDetails.uninitialized(),
      );
    }

    const gate = this.store.getGate(gateName);
    if (!gate) {
      OutputLogger.debug(
        `statsigSDK> Evaluating a non-existent gate ${gateName}`,
      );
      return this.getUnrecognizedEvaluation();
    }
    return this._evalSpec(
      EvaluationContext.get(ctx.getRequestContext(), { user, spec: gate }),
    );
  }

  public getConfig(
    user: StatsigUser,
    configName: string,
    ctx: StatsigContext,
    skipStickyEvaluation = false,
  ): ConfigEvaluation {
    const override = this.lookupConfigOverride(user, configName);
    if (override) {
      return override.withEvaluationDetails(
        EvaluationDetails.make(
          this.store.getLastUpdateTime(),
          this.store.getInitialUpdateTime(),
          'LocalOverride',
        ),
      );
    }

    if (this.store.getInitReason() === 'Uninitialized') {
      return new ConfigEvaluation(false).withEvaluationDetails(
        EvaluationDetails.uninitialized(),
      );
    }

    const config = this.store.getConfig(configName);
    if (!config) {
      OutputLogger.debug(
        `statsigSDK> Evaluating a non-existent config ${configName}`,
      );
      return this.getUnrecognizedEvaluation();
    }
    return this._evalConfig(
      EvaluationContext.get(ctx.getRequestContext(), {
        user,
        spec: config,
      }),
      skipStickyEvaluation,
    );
  }

  public getLayer(
    user: StatsigUser,
    layerName: string,
    ctx: StatsigContext,
  ): ConfigEvaluation {
    const override = this.lookupLayerOverride(user, layerName);
    if (override) {
      return override.withEvaluationDetails(
        EvaluationDetails.make(
          this.store.getLastUpdateTime(),
          this.store.getInitialUpdateTime(),
          'LocalOverride',
        ),
      );
    }

    if (this.store.getInitReason() === 'Uninitialized') {
      return new ConfigEvaluation(false).withEvaluationDetails(
        EvaluationDetails.uninitialized(),
      );
    }

    const layer = this.store.getLayer(layerName);
    if (!layer) {
      OutputLogger.debug(
        `statsigSDK> Evaluating a non-existent layer ${layerName}`,
      );
      return this.getUnrecognizedEvaluation();
    }
    return this._evalLayer(
      EvaluationContext.get(ctx.getRequestContext(), { user, spec: layer }),
    );
  }

  public getUserPersistedValues(
    user: StatsigUser,
    idType: string,
  ): UserPersistedValues {
    return this.persistentStore.load(user, idType) ?? {};
  }

  public getClientInitializeResponse(
    inputUser: StatsigUser,
    ctx: StatsigContext,
    clientSDKKey?: string,
    options?: ClientInitializeResponseOptions,
  ): ClientInitializeResponse | null {
    if (!this.store.isServingChecks()) {
      return null;
    }
    const user = cloneEnforce(inputUser);
    const clientKeyToAppMap = this.store.getClientKeyToAppMap();
    const hashAlgo = options?.hash ?? 'djb2';
    let targetAppID: string | null = null;
    let targetEntities: APIEntityNames | null = null;
    if (clientSDKKey != null) {
      const hashedClientKeyToAppMap = this.store.getHashedClientKeyToAppMap();
      const hashedSDKKeysToEntities = this.store.getHashedSDKKeysToEntities();
      targetAppID = hashedClientKeyToAppMap[djb2Hash(clientSDKKey)] ?? null;
      targetEntities = hashedSDKKeysToEntities[djb2Hash(clientSDKKey)] ?? null;
    }
    if (clientSDKKey != null && targetAppID == null) {
      targetAppID = clientKeyToAppMap[clientSDKKey] ?? null;
    }

    const filterTargetAppID = (spec: ConfigSpec) => {
      if (
        targetAppID != null &&
        !(spec.targetAppIDs ?? []).includes(targetAppID)
      ) {
        return false;
      }
      return true;
    };
    const filterGate = (spec: ConfigSpec) => {
      if (spec.entity === 'segment' || spec.entity === 'holdout') {
        return false;
      }
      if (targetEntities != null && !targetEntities.gates.includes(spec.name)) {
        return false;
      }
      return filterTargetAppID(spec);
    };
    const filterConfig = (spec: ConfigSpec) => {
      if (
        targetEntities != null &&
        !targetEntities.configs.includes(spec.name)
      ) {
        return false;
      }
      return filterTargetAppID(spec);
    };
    const gates = Object.entries(this.store.getAllGates())
      .filter(([, spec]) => filterGate(spec))
      .map(([gate, spec]) => {
        const localOverride = options?.includeLocalOverrides
          ? this.lookupGateOverride(user, spec.name)
          : null;
        const res =
          localOverride ??
          this._eval(
            EvaluationContext.get(ctx.getRequestContext(), {
              user,
              spec,
              targetAppID: targetAppID ?? undefined,
            }),
          );
        return {
          name: hashString(gate, hashAlgo),
          value: res.unsupported ? false : res.value,
          rule_id: res.rule_id,
          secondary_exposures: this.hashSecondaryExposure(
            res.secondary_exposures,
            hashAlgo,
          ),
          id_type: spec.idType,
        };
      });

    const configs = Object.entries(this.store.getAllConfigs())
      .filter(([, spec]) => filterConfig(spec))
      .map(([, spec]) => {
        const localOverride = options?.includeLocalOverrides
          ? this.lookupConfigOverride(user, spec.name)
          : null;
        const res =
          localOverride ??
          this._eval(
            EvaluationContext.get(ctx.getRequestContext(), {
              user,
              spec,
              targetAppID: targetAppID ?? undefined,
            }),
          );
        const format = this._specToInitializeResponse(spec, res, hashAlgo);
        format.id_type = spec.idType ?? null;
        if (spec.entity === 'dynamic_config') {
          format.passed = res.value === true;
        }
        if (spec.entity !== 'dynamic_config' && spec.entity !== 'autotune') {
          format.is_user_in_experiment = this._isUserAllocatedToExperiment(
            user,
            spec,
            ctx,
          );
          format.is_experiment_active = this._isExperimentActive(spec);
          if (spec.hasSharedParams) {
            format.is_in_layer = true;
            format.explicit_parameters = spec.explicitParameters ?? [];

            let layerValue = {};
            const layerName = this.store.getExperimentLayer(spec.name);
            if (layerName != null) {
              const layer = this.store.getLayer(layerName);
              if (layer != null) {
                layerValue = layer.defaultValue as object;
              }
            }

            format.value = {
              ...layerValue,
              ...(format.value as object),
            };
          }
        }

        return format;
      });

    const layers = Object.entries(this.store.getAllLayers())
      .filter(([, spec]) => filterTargetAppID(spec))
      .map(([, spec]) => {
        const localOverride = options?.includeLocalOverrides
          ? this.lookupLayerOverride(user, spec.name)
          : null;
        const res =
          localOverride ??
          this._eval(
            EvaluationContext.get(ctx.getRequestContext(), {
              user,
              spec,
              targetAppID: targetAppID ?? undefined,
            }),
          );
        const format = this._specToInitializeResponse(spec, res, hashAlgo);
        format.explicit_parameters = spec.explicitParameters ?? [];
        if (res.config_delegate != null && res.config_delegate !== '') {
          const delegateSpec = this.store.getConfig(res.config_delegate);
          if (delegateSpec != null) {
            const delegateRes = this._eval(
              EvaluationContext.get(ctx.getRequestContext(), {
                user,
                spec: delegateSpec,
                targetAppID: targetAppID ?? undefined,
              }),
            );
            if (
              delegateRes.group_name != null &&
              delegateRes.group_name !== ''
            ) {
              format.group_name = delegateRes.group_name;
            }
          }
          format.allocated_experiment_name = hashString(
            res.config_delegate,
            hashAlgo,
          );

          format.is_experiment_active = this._isExperimentActive(delegateSpec);
          format.is_user_in_experiment = this._isUserAllocatedToExperiment(
            user,
            delegateSpec,
            ctx,
          );
          format.explicit_parameters = delegateSpec?.explicitParameters ?? [];
        }
        // By this point, undelegated secondary exposure is hashed already because it reuse same
        // array object as secondary exposures
        format.undelegated_secondary_exposures =
          res.undelegated_secondary_exposures ?? [];

        return format;
      });

    const evaluatedKeys: Record<string, unknown> = {};
    if (user.userID) {
      evaluatedKeys['userID'] = user.userID;
    }
    if (user.customIDs && Object.keys(user.customIDs).length > 0) {
      evaluatedKeys['customIDs'] = user.customIDs;
    }

    delete user.privateAttributes;
    this.deleteUndefinedFields(user);

    return {
      feature_gates: Object.assign(
        {},
        ...gates.map((item) => ({ [item.name]: item })),
      ),
      dynamic_configs: Object.assign(
        {},
        ...configs.map((item) => ({ [item.name]: item })),
      ),
      layer_configs: Object.assign(
        {},
        ...layers.map((item) => ({ [item.name]: item })),
      ),
      sdkParams: {},
      has_updates: true,
      generator: 'statsig-node-sdk',
      sdkInfo: { sdkType: getSDKType(), sdkVersion: getSDKVersion() },
      time: this.store.getLastUpdateTime(),
      evaluated_keys: evaluatedKeys,
      hash_used: hashAlgo,
      user: user,
    };
  }

  public clearAllGateOverrides(): void {
    this.gateOverrides = {};
  }

  public clearAllConfigOverrides(): void {
    this.configOverrides = {};
  }

  public clearAllLayerOverrides(): void {
    this.layerOverrides = {};
  }

  public resetSyncTimerIfExited(): Error | null {
    return this.store.resetSyncTimerIfExited();
  }

  public async syncStoreSpecs(): Promise<void> {
    await this.store.syncConfigSpecs();
  }

  public async syncStoreIdLists(): Promise<void> {
    await this.store.syncIdLists();
  }

  public getFeatureGateList(): string[] {
    const gates = this.store.getAllGates();
    return Object.entries(gates).map(([name, _]) => name);
  }

  public getExperimentLayer(experimentName: string): string | null {
    return this.store.getExperimentLayer(experimentName);
  }

  public getConfigsList(
    entityType: 'experiment' | 'dynamic_config' | 'autotune',
  ): string[] {
    const configs = this.store.getAllConfigs();
    return Object.entries(configs)
      .filter(([_, config]) => config.entity === entityType)
      .map(([name, _]) => name);
  }

  public getLayerList(): string[] {
    const layers = this.store.getAllLayers();
    return Object.entries(layers).map(([name, _]) => name);
  }

  private deleteUndefinedFields<T>(obj: T): void {
    for (const key in obj) {
      if (obj[key] === undefined) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        this.deleteUndefinedFields(obj[key]);
      }
    }
  }

  private lookupGateOverride(
    user: StatsigUser,
    gateName: string,
  ): ConfigEvaluation | null {
    const overrides = this.gateOverrides[gateName];
    if (overrides == null) {
      return null;
    }
    if (user.userID != null) {
      // check for a user level override
      const userOverride = overrides[user.userID];
      if (userOverride != null) {
        return new ConfigEvaluation(userOverride, 'override');
      }
    }

    // check if there is a customID override
    const customIDs = user.customIDs;
    if (customIDs != null) {
      for (const customID in customIDs) {
        const id = customIDs[customID];
        const customIDOverride = overrides[id];
        if (customIDOverride != null) {
          return new ConfigEvaluation(customIDOverride, 'override');
        }
      }
    }

    // check if there is a global override
    const allOverride = overrides[''];
    if (allOverride != null) {
      return new ConfigEvaluation(allOverride, 'override');
    }
    return null;
  }

  private lookupConfigOverride(
    user: StatsigUser,
    configName: string,
  ): ConfigEvaluation | null {
    const overrides = this.configOverrides[configName];
    return this.lookupConfigBasedOverride(user, overrides);
  }

  private lookupLayerOverride(
    user: StatsigUser,
    layerName: string,
  ): ConfigEvaluation | null {
    const overrides = this.layerOverrides[layerName];
    return this.lookupConfigBasedOverride(user, overrides);
  }

  private lookupConfigBasedOverride(
    user: StatsigUser,
    overrides: Record<string, Record<string, unknown>>,
  ): ConfigEvaluation | null {
    if (overrides == null) {
      return null;
    }

    if (user.userID != null) {
      // check for a user level override
      const userOverride = overrides[user.userID];
      if (userOverride != null) {
        return new ConfigEvaluation(
          true,
          'override',
          null,
          'userID',
          [],
          userOverride,
        );
      }
    }

    // check if there is a customID override
    const customIDs = user.customIDs;
    if (customIDs != null) {
      for (const customID in customIDs) {
        const id = customIDs[customID];
        const customIDOverride = overrides[id];
        if (customIDOverride != null) {
          return new ConfigEvaluation(
            true,
            'override',
            null,
            'userID',
            [],
            customIDOverride,
          );
        }
      }
    }

    // check if there is a global override
    const allOverride = overrides[''];
    if (allOverride != null) {
      return new ConfigEvaluation(true, 'override', null, '', [], allOverride);
    }
    return null;
  }

  private _specToInitializeResponse(
    spec: ConfigSpec,
    res: ConfigEvaluation,
    hash?: HashingAlgorithm,
  ): InitializeResponse {
    const output: InitializeResponse = {
      name: hashString(spec.name, hash),
      value: res.unsupported ? {} : res.json_value,
      group: res.rule_id,
      rule_id: res.rule_id,
      is_device_based:
        spec.idType != null && spec.idType.toLowerCase() === 'stableid',
      secondary_exposures: this.hashSecondaryExposure(
        res.secondary_exposures,
        hash,
      ),
    };

    if (res.group_name != null) {
      output.group_name = res.group_name;
    }

    if (res.explicit_parameters) {
      output.explicit_parameters = res.explicit_parameters;
    }

    return output;
  }

  private hashSecondaryExposure(
    secondary_exposures: SecondaryExposure[],
    hash: HashingAlgorithm | undefined,
  ): SecondaryExposure[] {
    secondary_exposures.forEach((exposure) => {
      exposure.gate = hashString(exposure.gate, hash);
    });
    return secondary_exposures;
  }

  private _cleanExposures(exposures: SecondaryExposure[]): SecondaryExposure[] {
    if (exposures.length === 0) {
      return exposures;
    }
    const seen: Record<string, boolean> = {};
    return exposures.filter((exposure) => {
      if (exposure.gate.startsWith('segment:')) {
        return false;
      }
      const key = `${exposure.gate}|${exposure.gateValue}|${exposure.ruleID}`;
      if (seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  public shutdown(): void {
    this.store.shutdown();
  }

  public async shutdownAsync(): Promise<void> {
    await this.store.shutdownAsync();
  }

  private getUnrecognizedEvaluation(): ConfigEvaluation {
    return new ConfigEvaluation(false, '', null).withEvaluationDetails(
      EvaluationDetails.make(
        this.store.getLastUpdateTime(),
        this.store.getInitialUpdateTime(),
        'Unrecognized',
      ),
    );
  }

  _evalConfig(
    ctx: EvaluationContext,
    skipStickyEvaluation = false,
  ): ConfigEvaluation {
    const { user, spec, userPersistedValues, persistentAssignmentOptions } =
      ctx;
    if (skipStickyEvaluation) {
      return this._evalSpec(ctx);
    }
    if (userPersistedValues == null || !spec.isActive) {
      this.persistentStore.delete(user, spec.idType, spec.name);
      return this._evalSpec(ctx);
    }

    const stickyConfig = userPersistedValues[spec.name];
    const stickyEvaluation = stickyConfig
      ? ConfigEvaluation.fromStickyValues(
          stickyConfig,
          this.store.getInitialUpdateTime(),
        )
      : null;

    if (stickyEvaluation) {
      if (persistentAssignmentOptions?.enforceTargeting) {
        const passesTargeting = this._evalTargeting(ctx);
        if (passesTargeting) {
          return stickyEvaluation;
        } else {
          return this._evalSpec(ctx);
        }
      } else {
        return stickyEvaluation;
      }
    }

    const evaluation = this._evalSpec(ctx);

    if (evaluation.is_experiment_group) {
      this.persistentStore.save(user, spec.idType, spec.name, evaluation);
    }

    return evaluation;
  }

  _evalLayer(ctx: EvaluationContext): ConfigEvaluation {
    const { user, spec, userPersistedValues, persistentAssignmentOptions } =
      ctx;
    if (!userPersistedValues) {
      this.persistentStore.delete(user, spec.idType, spec.name);
      return this._evalSpec(ctx);
    }

    const stickyConfig = userPersistedValues[spec.name];
    const stickyEvaluation = stickyConfig
      ? ConfigEvaluation.fromStickyValues(
          stickyConfig,
          this.store.getInitialUpdateTime(),
        )
      : null;

    if (stickyEvaluation) {
      const delegateSpec = stickyEvaluation.config_delegate
        ? this.store.getConfig(stickyEvaluation.config_delegate)
        : null;
      if (delegateSpec && delegateSpec.isActive) {
        if (persistentAssignmentOptions?.enforceTargeting) {
          const passesTargeting = this._evalTargeting(ctx, delegateSpec);
          if (passesTargeting) {
            return stickyEvaluation;
          } else {
            return this._evalSpec(ctx);
          }
        } else {
          return stickyEvaluation;
        }
      } else {
        this.persistentStore.delete(user, spec.idType, spec.name);
        return this._evalSpec(ctx);
      }
    }

    const evaluation = this._evalSpec(ctx);
    const delegateSpec = evaluation.config_delegate
      ? this.store.getConfig(evaluation.config_delegate)
      : null;
    if (delegateSpec && delegateSpec.isActive) {
      if (evaluation.is_experiment_group) {
        this.persistentStore.save(user, spec.idType, spec.name, evaluation);
      }
    } else {
      this.persistentStore.delete(user, spec.idType, spec.name);
    }
    return evaluation;
  }

  _evalTargeting(ctx: EvaluationContext, delegateSpec?: ConfigSpec): boolean {
    return (
      this._evalSpec(
        EvaluationContext.get(ctx.getRequestContext(), {
          user: ctx.user,
          spec: delegateSpec ?? ctx.spec,
          onlyEvaluateTargeting: true,
        }),
      ).value === false
    ); // Fail evaluation means to pass targeting (fall through logic)
  }

  _evalSpec(ctx: EvaluationContext): ConfigEvaluation {
    const evaulation = this._eval(ctx);
    if (evaulation.evaluation_details) {
      return evaulation;
    }

    return evaulation.withEvaluationDetails(
      EvaluationDetails.make(
        this.store.getLastUpdateTime(),
        this.store.getInitialUpdateTime(),
        this.store.getInitReason(),
      ),
    );
  }

  _eval(ctx: EvaluationContext): ConfigEvaluation {
    const { user, spec: config } = ctx;
    if (!config.enabled) {
      return new ConfigEvaluation(
        false,
        'disabled',
        null,
        config.idType,
        [],
        config.defaultValue as Record<string, unknown>,
        undefined, // explicit parameters
        undefined, // config delegate
        config.version,
      );
    }

    let rules = config.rules;
    if (ctx.onlyEvaluateTargeting) {
      rules = config.rules.filter((rule) => rule.isTargetingRule());
      if (rules.length === 0) {
        return new ConfigEvaluation(false);
      }
    }

    let secondary_exposures: SecondaryExposure[] = [];
    for (const rule of rules) {
      const ruleResult = this._evalRule(user, rule, ctx);
      if (ruleResult.unsupported) {
        return ConfigEvaluation.unsupported(
          this.store.getLastUpdateTime(),
          this.store.getInitialUpdateTime(),
          config.version,
        );
      }

      secondary_exposures = this._cleanExposures(
        secondary_exposures.concat(ruleResult.secondary_exposures),
      );

      if (ruleResult.value === true) {
        const delegatedResult = this._evalDelegate(
          rule,
          secondary_exposures,
          ctx,
        );
        if (delegatedResult) {
          return delegatedResult;
        }

        const pass = this._evalPassPercent(user, rule, config);
        const evaluation = new ConfigEvaluation(
          pass,
          ruleResult.rule_id,
          ruleResult.group_name,
          config.idType,
          secondary_exposures,
          pass
            ? ruleResult.json_value
            : (config.defaultValue as Record<string, unknown>),
          config.explicitParameters,
          ruleResult.config_delegate,
          config.version,
        );
        evaluation.setIsExperimentGroup(ruleResult.is_experiment_group);
        return evaluation;
      }
    }

    return new ConfigEvaluation(
      false,
      'default',
      null,
      config.idType,
      secondary_exposures,
      config.defaultValue as Record<string, unknown>,
      config.explicitParameters,
      undefined, // config delegate
      config.version,
    );
  }

  _evalDelegate(
    rule: ConfigRule,
    exposures: SecondaryExposure[],
    ctx: EvaluationContext,
  ) {
    if (rule.configDelegate == null) {
      return null;
    }
    const config = this.store.getConfig(rule.configDelegate);
    if (!config) {
      return null;
    }
    const delegatedResult = this.getConfig(
      ctx.user,
      rule.configDelegate,
      ctx,
      true, // skip sticky evaluation
    );
    delegatedResult.config_delegate = rule.configDelegate;
    delegatedResult.undelegated_secondary_exposures = exposures;
    delegatedResult.explicit_parameters = config.explicitParameters;
    delegatedResult.secondary_exposures = this._cleanExposures(
      exposures.concat(delegatedResult.secondary_exposures),
    );
    return delegatedResult;
  }

  _evalPassPercent(user: StatsigUser, rule: ConfigRule, config: ConfigSpec) {
    if (rule.passPercentage === 0.0) {
      return false;
    }
    if (rule.passPercentage === 100.0) {
      return true;
    }
    const hash = computeUserHash(
      config.salt +
        '.' +
        (rule.salt ?? rule.id) +
        '.' +
        (getUnitID(user, rule.idType) ?? ''),
    );
    return (
      Number(hash % BigInt(CONDITION_SEGMENT_COUNT)) < rule.passPercentage * 100
    );
  }

  _evalRule(user: StatsigUser, rule: ConfigRule, ctx: EvaluationContext) {
    let secondaryExposures: SecondaryExposure[] = [];
    let pass = true;

    for (const condition of rule.conditions) {
      const result = this._evalCondition(user, condition, ctx);
      if (result.unsupported) {
        return ConfigEvaluation.unsupported(
          this.store.getLastUpdateTime(),
          this.store.getInitialUpdateTime(),
          undefined,
        );
      }

      if (!result.passes) {
        pass = false;
      }

      if (result.exposures) {
        secondaryExposures = secondaryExposures.concat(result.exposures);
      }
    }

    const evaluation = new ConfigEvaluation(
      pass,
      rule.id,
      rule.groupName,
      null,
      secondaryExposures,
      rule.returnValue as Record<string, unknown>,
    );
    evaluation.setIsExperimentGroup(rule.isExperimentGroup ?? false);
    return evaluation;
  }

  _evalCondition(
    user: StatsigUser,
    condition: ConfigCondition,
    ctx: EvaluationContext,
  ): {
    passes: boolean;
    unsupported?: boolean;
    exposures?: SecondaryExposure[];
  } {
    let value = null;
    const field = condition.field;
    const target = condition.targetValue;
    const idType = condition.idType;
    switch (condition.type.toLowerCase()) {
      case 'public':
        return { passes: true };
      case 'fail_gate':
      case 'pass_gate': {
        const gateResult = this.checkGate(user, target as string, ctx);
        if (gateResult?.unsupported) {
          return { passes: false, unsupported: true };
        }
        value = gateResult?.value;

        const allExposures = gateResult?.secondary_exposures ?? [];
        allExposures.push({
          gate: String(target),
          gateValue: String(value),
          ruleID: gateResult?.rule_id ?? '',
        });

        return {
          passes:
            condition.type.toLowerCase() === 'fail_gate' ? !value : !!value,
          exposures: allExposures,
        };
      }
      case 'multi_pass_gate':
      case 'multi_fail_gate': {
        if (!Array.isArray(target)) {
          return { passes: false, unsupported: true };
        }
        const gateNames = target as string[];
        let value = false;
        let exposures: SecondaryExposure[] = [];
        for (const gateName of gateNames) {
          const gateResult = this.checkGate(user, gateName, ctx);
          if (gateResult?.unsupported) {
            return { passes: false, unsupported: true };
          }
          const resValue =
            condition.type === 'multi_pass_gate'
              ? gateResult.value === true
              : gateResult.value === false;
          exposures.push({
            gate: String(gateName),
            gateValue: String(gateResult?.value),
            ruleID: gateResult?.rule_id ?? '',
          });
          exposures = exposures.concat(gateResult.secondary_exposures);

          if (resValue === true) {
            value = true;
            break;
          }
        }
        return {
          passes: value,
          exposures: exposures,
        };
      }
      case 'ip_based':
        // this would apply to things like 'country', 'region', etc.
        value = getFromUser(user, field) ?? this.getFromIP(user, field);
        break;
      case 'ua_based':
        // this would apply to things like 'os', 'browser', etc.
        value = getFromUser(user, field) ?? getFromUserAgent(user, field);
        break;
      case 'user_field':
        value = getFromUser(user, field);
        break;
      case 'environment_field':
        value = getFromEnvironment(user, field);
        break;
      case 'current_time':
        value = Date.now();
        break;
      case 'user_bucket': {
        const salt = condition.additionalValues?.salt;
        const userHash = computeUserHash(
          salt + '.' + (getUnitID(user, idType) ?? ''),
        );
        value = Number(userHash % BigInt(USER_BUCKET_COUNT));
        break;
      }
      case 'unit_id':
        value = getUnitID(user, idType);
        break;
      case 'target_app':
        value = ctx.clientKey
          ? ctx.targetAppID
          : this.store.getPrimaryTargetAppID();
        break;
      default:
        return { passes: false, unsupported: true };
    }

    const op = condition.operator?.toLowerCase();
    let evalResult = false;
    switch (op) {
      // numerical
      case 'gt':
        evalResult = numberCompare((a: number, b: number) => a > b)(
          value,
          target,
        );
        break;
      case 'gte':
        evalResult = numberCompare((a: number, b: number) => a >= b)(
          value,
          target,
        );
        break;
      case 'lt':
        evalResult = numberCompare((a: number, b: number) => a < b)(
          value,
          target,
        );
        break;
      case 'lte':
        evalResult = numberCompare((a: number, b: number) => a <= b)(
          value,
          target,
        );
        break;

      // version
      case 'version_gt':
        evalResult = versionCompareHelper((result) => result > 0)(
          value,
          target as string,
        );
        break;
      case 'version_gte':
        evalResult = versionCompareHelper((result) => result >= 0)(
          value,
          target as string,
        );
        break;
      case 'version_lt':
        evalResult = versionCompareHelper((result) => result < 0)(
          value,
          target as string,
        );
        break;
      case 'version_lte':
        evalResult = versionCompareHelper((result) => result <= 0)(
          value,
          target as string,
        );
        break;
      case 'version_eq':
        evalResult = versionCompareHelper((result) => result === 0)(
          value,
          target as string,
        );
        break;
      case 'version_neq':
        evalResult = versionCompareHelper((result) => result !== 0)(
          value,
          target as string,
        );
        break;

      // array
      case 'any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a === b),
        );
        break;
      case 'none':
        evalResult = !arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a === b),
        );
        break;
      case 'any_case_sensitive':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(false, (a, b) => a === b),
        );
        break;
      case 'none_case_sensitive':
        evalResult = !arrayAny(
          value,
          target,
          stringCompare(false, (a, b) => a === b),
        );
        break;

      // string
      case 'str_starts_with_any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.startsWith(b)),
        );
        break;
      case 'str_ends_with_any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.endsWith(b)),
        );
        break;
      case 'str_contains_any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.includes(b)),
        );
        break;
      case 'str_contains_none':
        evalResult = !arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.includes(b)),
        );
        break;
      case 'str_matches':
        try {
          if (String(value).length < 1000) {
            evalResult = new RegExp(target as string).test(String(value));
          } else {
            evalResult = false;
          }
        } catch (e) {
          evalResult = false;
        }
        break;
      // strictly equals
      case 'eq':
        evalResult = value == target;
        break;
      case 'neq':
        evalResult = value != target;
        break;

      // dates
      case 'before':
        evalResult = dateCompare((a, b) => a < b)(value, target as string);
        break;
      case 'after':
        evalResult = dateCompare((a, b) => a > b)(value, target as string);
        break;
      case 'on':
        evalResult = dateCompare((a, b) => {
          a?.setHours(0, 0, 0, 0);
          b?.setHours(0, 0, 0, 0);
          return a?.getTime() === b?.getTime();
        })(value, target as string);
        break;
      case 'in_segment_list':
      case 'not_in_segment_list': {
        const list = this.store.getIDList(target as string)?.ids;
        value = hashUnitIDForIDList(value);
        const inList = typeof list === 'object' && list[value] === true;
        evalResult = op === 'in_segment_list' ? inList : !inList;
        break;
      }
      case 'array_contains_any': {
        if (!Array.isArray(target)) {
          evalResult = false;
          break;
        }
        if (!Array.isArray(value)) {
          evalResult = false;
          break;
        }
        evalResult = arrayHasValue(value as unknown[], target as string[]);
        break;
      }
      case 'array_contains_none': {
        if (!Array.isArray(target)) {
          evalResult = false;
          break;
        }
        if (!Array.isArray(value)) {
          evalResult = false;
          break;
        }
        evalResult = !arrayHasValue(value as unknown[], target as string[]);
        break;
      }
      case 'array_contains_all': {
        if (!Array.isArray(target)) {
          evalResult = false;
          break;
        }
        if (!Array.isArray(value)) {
          evalResult = false;
          break;
        }
        evalResult = arrayHasAllValues(value as unknown[], target as string[]);
        break;
      }
      case 'not_array_contains_all': {
        if (!Array.isArray(target)) {
          evalResult = false;
          break;
        }
        if (!Array.isArray(value)) {
          evalResult = false;
          break;
        }
        evalResult = !arrayHasAllValues(value as unknown[], target as string[]);
        break;
      }
      default:
        return { passes: false, unsupported: true };
    }
    return { passes: evalResult };
  }

  _isExperimentActive(experimentConfig: ConfigSpec | null) {
    if (experimentConfig == null) {
      return false;
    }
    return experimentConfig.isActive === true;
  }

  _isUserAllocatedToExperiment(
    user: StatsigUser,
    experimentConfig: ConfigSpec | null,
    ctx: StatsigContext,
  ) {
    if (experimentConfig == null) {
      return false;
    }
    const evalResult = this._eval(
      EvaluationContext.get(ctx.getRequestContext(), {
        user,
        spec: experimentConfig,
      }),
    );
    return evalResult.is_experiment_group;
  }

  private getFromIP(user: StatsigUser, field: string) {
    const ip = getFromUser(user, 'ip');
    if (ip == null || field !== 'country') {
      return null;
    }
    return this.ip2country(ip);
  }

  public ip2country(ip: string | number): string | null {
    if (!this.initialized) {
      return null;
    }
    try {
      if (typeof ip === 'string') {
        return ip3country.lookupStr(ip);
      } else if (typeof ip === 'number') {
        return ip3country.lookupNumeric(ip);
      }
    } catch (e) {
      // TODO: log
    }
    return null;
  }
}
