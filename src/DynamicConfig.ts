import type { EvaluationDetails } from './EvaluationDetails';
import { SecondaryExposure } from './LogEvent';
import { clone, getTypeOf } from './utils/core';

export type OnDefaultValueFallback = (
  config: DynamicConfig,
  parameter: string,
  defaultValueType: string,
  valueType: string,
) => void;

/**
 * Returns the data for a DynamicConfig in the statsig console via typed get functions
 */
export default class DynamicConfig {
  public name: string;
  public value: Record<string, unknown>;
  private _ruleID: string;
  private _groupName: string | null;
  private _idType: string | null;
  private _secondaryExposures: SecondaryExposure[];
  private _onDefaultValueFallback: OnDefaultValueFallback | null = null;
  private _evaluationDetails: EvaluationDetails | null;

  public constructor(
    configName: string,
    value: Record<string, unknown> = {},
    ruleID = '',
    groupName: string | null = null,
    idType: string | null = null,
    secondaryExposures: SecondaryExposure[] = [],
    onDefaultValueFallback: OnDefaultValueFallback | null = null,
    evaluationDetails: EvaluationDetails | null = null,
  ) {
    if (typeof configName !== 'string' || configName.length === 0) {
      configName = '';
    }
    if (value == null || typeof value !== 'object') {
      value = {};
    }
    this.name = configName;
    this.value = clone(value) ?? {};
    this._ruleID = ruleID;
    this._groupName = groupName;
    this._idType = idType;
    this._secondaryExposures = Array.isArray(secondaryExposures)
      ? secondaryExposures
      : [];
    this._onDefaultValueFallback = onDefaultValueFallback;
    this._evaluationDetails = evaluationDetails;
  }

  public get<T>(
    key: string,
    defaultValue: T,
    typeGuard: ((value: unknown) => value is T | null) | null = null,
  ): T {
    // @ts-ignore
    defaultValue = defaultValue ?? null;

    // @ts-ignore
    const val = this.getValue(key, defaultValue);

    if (val == null) {
      return defaultValue;
    }

    const expectedType = getTypeOf(defaultValue);
    const actualType = getTypeOf(val);

    if (typeGuard != null) {
      if (typeGuard(val)) {
        return val as T;
      }

      this._onDefaultValueFallback?.(this, key, expectedType, actualType);
      return defaultValue;
    }

    if (defaultValue == null || expectedType === actualType) {
      return val as T;
    }

    this._onDefaultValueFallback?.(this, key, expectedType, actualType);
    return defaultValue;
  }

  getValue(
    key: string,
    defaultValue?: boolean | number | string | object | Array<any> | null,
  ): unknown | null {
    if (key == null) {
      return this.value;
    }

    if (defaultValue === undefined) {
      defaultValue = null;
    }

    return this.value[key] ?? defaultValue;
  }

  getRuleID(): string {
    return this._ruleID;
  }

  getGroupName(): string | null {
    return this._groupName;
  }

  getIDType(): string | null {
    return this._idType;
  }

  getEvaluationDetails(): EvaluationDetails | null {
    return this._evaluationDetails;
  }

  _getSecondaryExposures(): SecondaryExposure[] {
    return this._secondaryExposures;
  }
}
