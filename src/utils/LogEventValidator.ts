import OutputLogger from '../OutputLogger';
import { StatsigUser } from '../StatsigUser';

const MAX_VALUE_SIZE = 128;
export const MAX_OBJ_SIZE = 4096;
const MAX_USER_SIZE = 4096;

export default class LogEventValidator {
  public static validateEventName(eventName: string): string | null {
    if (
      eventName == null ||
      eventName.length === 0 ||
      typeof eventName !== 'string'
    ) {
      OutputLogger.error(
        'statsigSDK> EventName needs to be a string of non-zero length.',
      );
      return null;
    }
    if (this.shouldTrimParam(eventName, MAX_VALUE_SIZE)) {
      OutputLogger.warn(
        `statsigSDK> Event name is too large (max ${MAX_VALUE_SIZE}). It may be trimmed.`,
      );
    }
    return eventName;
  }

  public static validateUserObject(user: StatsigUser): StatsigUser | null {
    if (user == null) {
      OutputLogger.warn('statsigSDK> User cannot be null.');
      return null;
    }
    if (user != null && typeof user !== 'object') {
      OutputLogger.warn(
        'statsigSDK> User is not set because it needs to be an object.',
      );
      return null;
    }

    if (
      user.userID != null &&
      this.shouldTrimParam(user.userID, MAX_VALUE_SIZE)
    ) {
      OutputLogger.warn(
        `statsigSDK> User ID is too large (max ${MAX_VALUE_SIZE}). It may be trimmed.`,
      );
    }

    if (this.shouldTrimParam(user, MAX_USER_SIZE)) {
      OutputLogger.warn(
        `statsigSDK> User object is too large (max ${MAX_USER_SIZE}). Some attributes may be stripped.`,
      );
    }
    return user;
  }

  public static validateEventValue(
    value: string | number | null,
  ): string | number | null {
    if (value == null) {
      return null;
    }
    if (
      typeof value === 'string' &&
      this.shouldTrimParam(value, MAX_VALUE_SIZE)
    ) {
      OutputLogger.warn(
        `statsigSDK> Event value is too large (max ${MAX_VALUE_SIZE}). It may be trimmed.`,
      );
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    } else if (typeof value === 'number') {
      return value;
    } else {
      return value.toString();
    }
  }

  public static validateEventMetadata(
    metadata: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (metadata != null && typeof metadata !== 'object') {
      OutputLogger.warn(
        'statsigSDK> Metadata is not set because it needs to be an object.',
      );
      return null;
    }
    if (this.shouldTrimParam(metadata, MAX_OBJ_SIZE)) {
      OutputLogger.warn(
        `statsigSDK> Event metadata is too large (max ${MAX_OBJ_SIZE}). Some attributes may be stripped.`,
      );
    }
    return metadata;
  }

  public static validateEventTime(time: number): number | null {
    if (time != null && typeof time !== 'number') {
      OutputLogger.warn(
        'statsigSDK> Timestamp is not set because it needs to be a number.',
      );
      return null;
    }
    return time;
  }

  private static shouldTrimParam(
    param: object | string | number | null | unknown,
    size: number,
  ): boolean {
    if (param == null) return false;
    if (typeof param === 'string') return param.length > size;
    if (typeof param === 'object') {
      return this.approximateObjectSize(param) > size;
    }
    if (typeof param === 'number') return param.toString().length > size;
    return false;
  }

  public static approximateObjectSize(x: object): number {
    let size = 0;
    const entries = Object.entries(x);
    for (let i = 0; i < entries.length; i++) {
      const key = entries[i][0];
      const value = entries[i][1] as unknown;
      if (typeof value === 'object' && value !== null) {
        size += this.approximateObjectSize(value);
      } else {
        size += String(value).length;
      }
      size += key.length;
    }
    return size;
  }
}
