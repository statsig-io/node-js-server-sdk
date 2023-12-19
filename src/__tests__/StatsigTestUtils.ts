import StatsigInstanceUtils from '../StatsigInstanceUtils';

export default abstract class StatsigTestUtils {
  static getEvaluator(): any {
    // @ts-ignore
    return StatsigInstanceUtils.getInstance()?._evaluator ?? null;
  }

  static getLogger(): any {
    // @ts-ignore
    return StatsigInstanceUtils.getInstance()?._logger ?? null;
  }
}

export function assertMarkerEqual(marker: any, expected: any) {
  expect(marker).toStrictEqual({
    ...expected,
    timestamp: expect.any(Number),
  });
}

export function parseLogEvents(request: any, filterDiagnosticsEvent: boolean = true) {
  const logs = getDecodedBody(request)
  if(filterDiagnosticsEvent) {
    return {events:logs.events.filter(log => log.eventName !== 'statsig::diagnostics')}
  }
  return logs
}

export function getDecodedBody(request: any) {
  const body = request.body;
  if (typeof body === 'string') {
    return JSON.parse(body);
  }

  const headers = request.headers;
  if (
    headers && 
    headers['Content-Encoding'] === 'gzip' && 
    Buffer.isBuffer(body)
  ) {
    return JSON.parse(require('zlib').gunzipSync(body).toString('utf8'));
  }

  return body;
}
