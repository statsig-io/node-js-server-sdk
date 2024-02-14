import { clone } from './utils/core';

type ExposeLayer = (layer: Layer, key: string) => void;

/**
 * Returns the data for a Layer in the statsig console via typed get functions
 */
export default class Layer {
  public name: string;
  private _value: Record<string, unknown>;
  private _ruleID: string;
  private _groupName: string | null;
  private _allocatedExperimentName: string | null;
  private _logExposure: ExposeLayer | null;

  public constructor(
    layerName: string,
    value: Record<string, unknown> = {},
    ruleID = '',
    groupName: string | null = null,
    allocatedExperimentName: string | null = null,
    logExposure: ExposeLayer | null = null,
  ) {
    if (typeof layerName !== 'string' || layerName.length === 0) {
      layerName = '';
    }
    if (value == null || typeof value !== 'object') {
      value = {};
    }

    this.name = layerName;
    this._value = clone(value) ?? {};
    this._ruleID = ruleID;
    this._groupName = groupName;
    this._allocatedExperimentName = allocatedExperimentName;
    this._logExposure = logExposure;
  }

  public get<T>(
    key: string,
    defaultValue: T,
    typeGuard: ((value: unknown) => value is T) | null = null,
  ): T {
    // @ts-ignore
    defaultValue = defaultValue ?? null;

    const val = this._value[key];

    if (val == null) {
      return defaultValue;
    }

    const logAndReturn = (): T => {
      this._logExposure?.(this, key);
      return val as T;
    };

    if (typeGuard) {
      return typeGuard(val) ? logAndReturn() : defaultValue;
    }

    if (defaultValue == null) {
      return logAndReturn();
    }

    if (
      typeof val === typeof defaultValue &&
      Array.isArray(defaultValue) === Array.isArray(val)
    ) {
      return logAndReturn();
    }

    return defaultValue;
  }

  getValue(
    key: string,
    defaultValue?: boolean | number | string | object | Array<any> | null,
  ): unknown | null {
    if (defaultValue === undefined) {
      defaultValue = null;
    }

    if (key == null) {
      return defaultValue;
    }

    if (this._value[key] != null) {
      this._logExposure?.(this, key);
    }

    return this._value[key] ?? defaultValue;
  }

  getRuleID(): string {
    return this._ruleID;
  }

  getGroupName(): string | null {
    return this._groupName;
  }

  getAllocatedExperimentName(): string | null {
    return this._allocatedExperimentName;
  }
}
