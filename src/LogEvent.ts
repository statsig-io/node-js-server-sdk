import { Marker } from './Diagnostics';
import { ExplicitStatsigOptions } from './StatsigOptions';
import { StatsigUser } from './StatsigUser';
import { clone } from './utils/core';
import LogEventValidator, { MAX_OBJ_SIZE } from './utils/LogEventValidator';

export type LogEventData = {
  time: number;
  eventName: string;
  user: StatsigUser | null;
  value: string | number | null;
  metadata: Record<string, unknown> | null;
  secondaryExposures: Record<string, unknown>[];
};

export default class LogEvent {
  private time: number;
  private eventName: string;
  private user: StatsigUser | null = null;
  private value: string | number | null = null;
  private metadata: Record<string, unknown> | null = null;
  private secondaryExposures: Record<string, unknown>[] = [];

  public constructor(eventName: string) {
    this.time = Date.now();
    this.eventName =
      LogEventValidator.validateEventName(eventName) ?? 'invalid_event';
  }

  public setUser(user: StatsigUser) {
    const validatedUser = LogEventValidator.validateUserObject(user);
    if (validatedUser == null) {
      return;
    }
    this.user = clone(validatedUser);
    if (this.user != null) {
      this.user.privateAttributes = null;
    }
  }

  public setValue(value: string | number | null) {
    const validatedValue = LogEventValidator.validateEventValue(value);
    if (validatedValue == null) {
      return;
    }
    this.value = validatedValue;
  }

  public setMetadata(metadata: Record<string, unknown> | null) {
    const validatedMetadata = LogEventValidator.validateEventMetadata(metadata);
    if (validatedMetadata == null) {
      return;
    }
    this.metadata = clone(validatedMetadata);
  }

  public setDiagnosticsMetadata(metadata: {
    context: string;
    markers: Marker[];
    statsigOptions: object | undefined;
  }) {
    const metadataSize = LogEventValidator.approximateObjectSize(metadata);
    let optionSize = 0;
    const metadataCopy = clone(metadata) as {
      context: string;
      markers: unknown;
      statsigOptions: unknown;
    };
    if (metadataSize > MAX_OBJ_SIZE) {
      if (metadata.statsigOptions) {
        optionSize = LogEventValidator.approximateObjectSize(
          metadata.statsigOptions,
        );
        metadataCopy.statsigOptions = 'dropped';
      }
      if (metadataSize - optionSize > MAX_OBJ_SIZE) {
        if (metadata.context === 'initialize') {
          metadataCopy.markers = metadata.markers.filter(
            (marker) => marker.key === 'overall',
          );
        } else {
          metadataCopy.markers = 'dropped';
        }
      }
    }
    this.metadata = metadataCopy;
  }

  public setTime(time: number) {
    const validatedTime = LogEventValidator.validateEventTime(time);
    if (validatedTime == null) {
      return;
    }
    this.time = validatedTime;
  }

  public setSecondaryExposures(exposures: Record<string, unknown>[]) {
    this.secondaryExposures = Array.isArray(exposures) ? exposures : [];
  }

  public validate(): boolean {
    return typeof this.eventName === 'string' && this.eventName.length > 0;
  }

  public toObject(): LogEventData {
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
