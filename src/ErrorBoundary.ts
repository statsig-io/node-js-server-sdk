import Diagnostics from './Diagnostics';
import {
  StatsigInvalidArgumentError,
  StatsigLocalModeNetworkError,
  StatsigTooManyRequestsError,
  StatsigUninitializedError,
} from './Errors';
import OutputLogger from './OutputLogger';
import { NetworkOverrideFunc, StatsigOptions } from './StatsigOptions';
import { getSDKType, getSDKVersion, getStatsigMetadata } from './utils/core';
import safeFetch from './utils/safeFetch';
import { StatsigContext } from './utils/StatsigContext';

export const ExceptionEndpoint = 'https://statsigapi.net/v1/sdk_exception';

export default class ErrorBoundary {
  private sdkKey: string;
  private optionsLoggingCopy: StatsigOptions;
  private statsigMetadata = getStatsigMetadata();
  private seen = new Set<string>();
  private networkOverrideFunc: NetworkOverrideFunc | null;

  constructor(
    sdkKey: string,
    optionsLoggingCopy: StatsigOptions,
    sessionID: string,
  ) {
    this.sdkKey = sdkKey;
    this.optionsLoggingCopy = optionsLoggingCopy;
    this.statsigMetadata['sessionID'] = sessionID;
    this.networkOverrideFunc = optionsLoggingCopy.networkOverrideFunc ?? null;
  }

  swallow<T>(task: (ctx: StatsigContext) => T, ctx: StatsigContext) {
    this.capture(
      task,
      () => {
        return undefined;
      },
      ctx,
    );
  }

  capture<T, C extends StatsigContext>(
    task: (ctx: C) => T,
    recover: (ctx: C, e: unknown) => T,
    ctx: C,
  ): T {
    let markerID: string | null = null;
    try {
      markerID = this.beginMarker(ctx.caller, ctx.configName);
      const result = task(ctx);
      if (result instanceof Promise) {
        return (result as any).catch((e: unknown) => {
          return this.onCaught(e, recover, ctx);
        });
      }
      this.endMarker(ctx.caller, true, markerID, ctx.configName);
      return result;
    } catch (error) {
      this.endMarker(ctx.caller, false, markerID, ctx.configName);
      return this.onCaught(error, recover, ctx);
    }
  }

  setup(sdkKey: string) {
    this.sdkKey = sdkKey;
  }

  private onCaught<T, C extends StatsigContext>(
    error: unknown,
    recover: (ctx: C, e: unknown) => T,
    ctx: C,
  ): T {
    if (
      error instanceof StatsigUninitializedError ||
      error instanceof StatsigInvalidArgumentError ||
      error instanceof StatsigTooManyRequestsError
    ) {
      throw error; // Don't catch these
    }
    if (error instanceof StatsigLocalModeNetworkError) {
      return recover(ctx, error);
    }

    OutputLogger.error(
      '[Statsig] An unexpected exception occurred.',
      error as Error,
    );

    this.logError(error, ctx);

    return recover(ctx, error);
  }

  public logError(error: unknown, ctx: StatsigContext) {
    try {
      if (!this.sdkKey || this.optionsLoggingCopy.disableAllLogging) {
        return;
      }

      const unwrapped = error ?? Error('[Statsig] Error was empty');
      const isError = unwrapped instanceof Error;
      const name = isError && unwrapped.name ? unwrapped.name : 'No Name';
      const hasSeen = this.seen.has(name);
      if (ctx.bypassDedupe !== true && hasSeen) {
        return;
      }
      this.seen.add(name);
      const info = isError ? unwrapped.stack : this.getDescription(unwrapped);
      const body = JSON.stringify({
        exception: name,
        info,
        statsigMetadata: this.statsigMetadata ?? {},
        statsigOptions: this.optionsLoggingCopy,
        ...ctx.getContextForLogging(),
      });

      const fetcher = this.networkOverrideFunc ?? safeFetch;
      fetcher(ExceptionEndpoint, {
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
