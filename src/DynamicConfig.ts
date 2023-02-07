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
  private _groupName: string;
  private _secondaryExposures: Record<string, unknown>[];
  private _onDefaultValueFallback: OnDefaultValueFallback | null = null;

  public constructor(
    configName: string,
    value: Record<string, unknown> = {},
    ruleID: string = '',
    groupName: string = '',
    secondaryExposures: Record<string, unknown>[] = [],
    onDefaultValueFallback: OnDefaultValueFallback | null = null,
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
    this._secondaryExposures = Array.isArray(secondaryExposures)
      ? secondaryExposures
      : [];
    this._onDefaultValueFallback = onDefaultValueFallback;
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
      return val as unknown as T;
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

  getGroupName(): string {
    return this._groupName;
  }

  _getSecondaryExposures(): Record<string, unknown>[] {
    return this._secondaryExposures;
  }
}
