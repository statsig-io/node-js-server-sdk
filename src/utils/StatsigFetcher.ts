import { v4 as uuidv4 } from 'uuid';

import Diagnostics from '../Diagnostics';
import {
  StatsigLocalModeNetworkError,
  StatsigTooManyRequestsError,
} from '../Errors';
import { ExplicitStatsigOptions, RetryBackoffFunc } from '../StatsigOptions';
import { getSDKType, getSDKVersion } from './core';
import Dispatcher from './Dispatcher';
import safeFetch from './safeFetch';

const retryStatusCodes = [408, 500, 502, 503, 504, 522, 524, 599];

type RequestOptions = Partial<{
  retries: number;
  backoff: number | RetryBackoffFunc;
  isRetrying: boolean;
  signal?: AbortSignal;
}>;

export default class StatsigFetcher {
  private api: string;
  private apiForDownloadConfigSpecs: string;
  private sessionID: string;
  private leakyBucket: Record<string, number>;
  private pendingTimers: NodeJS.Timer[];
  private dispatcher: Dispatcher;
  private localMode: boolean;
  private sdkKey: string;

  public constructor(secretKey: string, options: ExplicitStatsigOptions) {
    this.api = options.api;
    this.apiForDownloadConfigSpecs = options.apiForDownloadConfigSpecs;
    this.sessionID = uuidv4();
    this.leakyBucket = {};
    this.pendingTimers = [];
    this.dispatcher = new Dispatcher(200);
    this.localMode = options.localMode;
    this.sdkKey = secretKey;
  }

  public async downloadConfigSpecs(sinceTime?: number): Promise<Response> {
    return await this.get(
      this.apiForDownloadConfigSpecs +
        '/download_config_specs' +
        `/${this.sdkKey}.json` +
        (sinceTime ? `?sinceTime=${sinceTime}` : ''),
    );
  }

  public async getIDLists(sinceTime?: number): Promise<Response> {
    return await this.post(this.api + '/get_id_lists', {});
  }

  public dispatch(
    url: string,
    body: Record<string, unknown>,
    timeout: number,
  ): Promise<Response> {
    return this.dispatcher.enqueue(this.post(url, body), timeout);
  }

  public async post(
    url: string,
    body: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Response> {
    return await this.request('POST', url, body, options);
  }

  public async get(url: string, options?: RequestOptions): Promise<Response> {
    return await this.request('GET', url, options);
  }

  public async request(
    method: 'POST' | 'GET',
    url: string,
    body?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Response> {
    const { retries = 0, backoff = 1000, isRetrying = false } = options ?? {};
    const markDiagnostic = this.getDiagnosticFromURL(url);
    if (this.localMode) {
      return Promise.reject(new StatsigLocalModeNetworkError());
    }
    const counter = this.leakyBucket[url];
    if (counter != null && counter >= 1000) {
      return Promise.reject(
        new StatsigTooManyRequestsError(
          `Request to ${url} failed because you are making the same request too frequently (${counter}).`,
        ),
      );
    }
    if (counter == null) {
      this.leakyBucket[url] = 1;
    } else {
      this.leakyBucket[url] = counter + 1;
    }

    const applyBackoffMultiplier = (backoff: number) =>
      isRetrying ? backoff * 10 : backoff;
    const backoffAdjusted =
      typeof backoff === 'number'
        ? applyBackoffMultiplier(backoff)
        : backoff(retries);

    const params = {
      method: method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-type': 'application/json; charset=UTF-8',
        'STATSIG-API-KEY': this.sdkKey,
        'STATSIG-CLIENT-TIME': Date.now(),
        'STATSIG-SERVER-SESSION-ID': this.sessionID,
        'STATSIG-SDK-TYPE': getSDKType(),
        'STATSIG-SDK-VERSION': getSDKVersion(),
      },
      signal: options?.signal,
    };

    if (!isRetrying) {
      markDiagnostic?.start({});
    }

    let res: Response | undefined;
    let error: unknown;
    return safeFetch(url, params)
      .then((localRes) => {
        res = localRes;
        if ((!res.ok || retryStatusCodes.includes(res.status)) && retries > 0) {
          return this._retry(method, url, body, retries - 1, backoffAdjusted);
        } else if (!res.ok) {
          return Promise.reject(
            new Error(
              'Request to ' + url + ' failed with status ' + res.status,
            ),
          );
        }
        return Promise.resolve(res);
      })
      .catch((e) => {
        error = e;
        if (retries > 0) {
          return this._retry(method, url, body, retries - 1, backoffAdjusted);
        }
        return Promise.reject(error);
      })
      .finally(() => {
        markDiagnostic?.end({
          statusCode: res?.status,
          success: res?.ok === true,
          sdkRegion: res?.headers?.get('x-statsig-region'),
          error: Diagnostics.formatNetworkError(error),
        });
        this.leakyBucket[url] = Math.max(this.leakyBucket[url] - 1, 0);
      });
  }

  public shutdown(): void {
    if (this.pendingTimers != null) {
      this.pendingTimers.forEach((timer) => {
        if (timer != null) {
          clearTimeout(timer);
        }
      });
    }
    if (this.dispatcher != null) {
      this.dispatcher.shutdown();
    }
  }

  private _retry(
    method: 'POST' | 'GET',
    url: string,
    body: Record<string, unknown> | undefined,
    retries: number,
    backoff: number,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.leakyBucket[url] = Math.max(this.leakyBucket[url] - 1, 0);
        this.request(method, url, body, { retries, backoff, isRetrying: true })
          .then(resolve)
          .catch(reject);
      }, backoff);

      if (timer.unref) {
        timer.unref();
      }

      this.pendingTimers.push(timer);
    });
  }

  private getDiagnosticFromURL(
    url: string,
  ):
    | typeof Diagnostics.mark.downloadConfigSpecs.networkRequest
    | typeof Diagnostics.mark.getIDListSources.networkRequest
    | null {
    if (url.includes('/download_config_specs')) {
      return Diagnostics.mark.downloadConfigSpecs.networkRequest;
    }
    if (url.includes('/get_id_lists')) {
      return Diagnostics.mark.getIDListSources.networkRequest;
    }
    return null;
  }
}
