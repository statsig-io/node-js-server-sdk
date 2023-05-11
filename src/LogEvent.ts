import type { LoggerInterface } from './StatsigOptions';
import { StatsigUser } from './StatsigUser';

import { clone } from './utils/core';

export default class LogEvent {
  private time: number;
  private eventName: string;
  private user: StatsigUser | null = null;
  private value: string | number | null = null;
  private metadata: Record<string, unknown> | null = null;
  private secondaryExposures: Record<string, unknown>[] = [];

  public constructor(eventName: string, logger: LoggerInterface) {
    if (eventName == null || typeof eventName !== 'string') {
      logger.error('statsigSDK> EventName needs to be a string.');
      eventName = 'invalid_event';
    }
    this.time = Date.now();
    this.eventName = eventName;
  }

  public setUser(logger: LoggerInterface, user: StatsigUser) {
    if (user != null && typeof user !== 'object') {
      logger.warn(
        'statsigSDK> User is not set because it needs to be an object.',
      );
      return;
    }
    this.user = clone(user);
    if (this.user != null) {
      this.user.privateAttributes = null;
    }
  }

  public setValue(value: string | number | null) {
    if (value == null) {
      return;
    }
    if (typeof value === 'object') {
      this.value = JSON.stringify(value);
    } else if (typeof value === 'number') {
      this.value = value;
    } else {
      this.value = value.toString();
    }
  }

  public setMetadata(logger: LoggerInterface, metadata: Record<string, unknown> | null) {
    if (metadata == null) {
      return;
    }
    if (metadata != null && typeof metadata !== 'object') {
      logger.warn(
        'statsigSDK> Metadata is not set because it needs to be an object.',
      );
      return;
    }
    this.metadata = clone(metadata);
  }

  public setTime(logger: LoggerInterface, time: number) {
    if (time != null && typeof time !== 'number') {
      logger.warn(
        'statsigSDK>Timestamp is not set because it needs to be a number.',
      );
      return;
    }
    this.time = time;
  }

  public setSecondaryExposures(exposures: Record<string, unknown>[]) {
    this.secondaryExposures = Array.isArray(exposures) ? exposures : [];
  }

  public validate(): boolean {
    return typeof this.eventName === 'string' && this.eventName.length > 0;
  }

  public toJSON(): Record<string, unknown> {
    return this.toObject();
  }

  public toObject(): Record<string, unknown> {
    return {
      eventName: this.eventName,
      metadata: this.metadata,
      time: this.time,
      user: this.user,
      value: this.value,
      secondaryExposures: this.secondaryExposures,
    };
  }
}
