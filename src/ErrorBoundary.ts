import Diagnostics from './Diagnostics';
import {
  StatsigInvalidArgumentError,
  StatsigLocalModeNetworkError,
  StatsigTooManyRequestsError,
  StatsigUninitializedError,
} from './Errors';
import OutputLogger from './OutputLogger';
import { StatsigOptions } from './StatsigOptions';
import { getSDKType, getSDKVersion, getStatsigMetadata } from './utils/core';
import safeFetch from './utils/safeFetch';

export const ExceptionEndpoint = 'https://statsigapi.net/v1/sdk_exception';

type ExtraArgs = Partial<{ configName: string; tag: string }>;

export default class ErrorBoundary {
  private sdkKey: string;
  private optionsLoggingCopy: StatsigOptions;
  private statsigMetadata = getStatsigMetadata();
  private seen = new Set<string>();

  constructor(
    sdkKey: string,
    optionsLoggingCopy: StatsigOptions,
    sessionID: string,
  ) {
    this.sdkKey = sdkKey;
    this.optionsLoggingCopy = optionsLoggingCopy;
    this.statsigMetadata['sessionID'] = sessionID;
  }

  swallow<T>(task: () => T, extra: ExtraArgs = {}) {
    this.capture(
      task,
      () => {
        return undefined;
      },
      extra,
    );
  }

  capture<T>(
    task: () => T,
    recover: (e: unknown) => T,
    extra: ExtraArgs = {},
  ): T {
    let markerID: string | null = null;
    try {
      markerID = this.beginMarker(extra.tag, extra.configName);
      const result = task();
      if (result instanceof Promise) {
        return (result as any).catch((e: unknown) => {
          return this.onCaught(e, recover, extra);
        });
      }
      this.endMarker(extra.tag, true, markerID, extra.configName);
      return result;
    } catch (error) {
      this.endMarker(extra.tag, false, markerID, extra.configName);
      return this.onCaught(error, recover);
    }
  }

  setup(sdkKey: string) {
    this.sdkKey = sdkKey;
  }

  private onCaught<T>(
    error: unknown,
    recover: (e: unknown) => T,
    extra: ExtraArgs = {},
  ): T {
    if (
      error instanceof StatsigUninitializedError ||
      error instanceof StatsigInvalidArgumentError ||
      error instanceof StatsigTooManyRequestsError
    ) {
      throw error; // Don't catch these
    }
    if (error instanceof StatsigLocalModeNetworkError) {
      return recover(error);
    }

    OutputLogger.error(
      '[Statsig] An unexpected exception occurred.',
      error as Error,
    );

    this.logError(error);

    return recover(error);
  }

  public logError(error: unknown, key?: string, extra: ExtraArgs = {}) {
    try {
      if (!this.sdkKey) {
        return;
      }

      const unwrapped = error ?? Error('[Statsig] Error was empty');
      const isError = unwrapped instanceof Error;
      const name = isError && unwrapped.name ? unwrapped.name : 'No Name';
      if (this.seen.has(name) || (key != null && this.seen.has(key))) {
        return;
      }
      this.seen.add(name);

      const info = isError ? unwrapped.stack : this.getDescription(unwrapped);
      const body = JSON.stringify({
        exception: name,
        info,
        statsigMetadata: this.statsigMetadata ?? {},
        configName: extra.configName,
        statsigOptions: this.optionsLoggingCopy,
        tag: extra.tag,
      });
      safeFetch(ExceptionEndpoint, {
        method: 'POST',
        headers: {
          'STATSIG-API-KEY': this.sdkKey,
          'STATSIG-SDK-TYPE': getSDKType(),
          'STATSIG-SDK-VERSION': getSDKVersion(),
          'Content-Type': 'application/json',
        },
        body,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
      }).catch(() => {});
    } catch {
      /* noop */
    }
  }

  private getDescription(obj: unknown): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return '[Statsig] Failed to get string for error.';
    }
  }

  private beginMarker(
    key: string | undefined,
    configName: string | undefined,
  ): string | null {
    if (key == null) {
      return null;
    }
    const diagnostics = Diagnostics.mark.api_call(key);
    if (!diagnostics) {
      return null;
    }
    const count = Diagnostics.getMarkerCount('api_call');
    const markerID = `${key}_${count}`;
    diagnostics.start(
      {
        markerID,
        configName,
      },
      'api_call',
    );
    return markerID;
  }

  private endMarker(
    key: string | undefined,
    wasSuccessful: boolean,
    markerID: string | null,
    configName?: string,
  ): void {
    if (key == null) {
      return;
    }
    const diagnostics = Diagnostics.mark.api_call(key);
    if (!markerID || !diagnostics) {
      return;
    }
    diagnostics.end(
      {
        markerID,
        success: wasSuccessful,
        configName,
      },
      'api_call',
    );
  }
}
