import ErrorBoundary from '../ErrorBoundary';
import { StatsigContext } from './StatsigContext';

export type CompressionType = 'gzip' | 'none';

export async function getEncodedBody(
  body: Record<string, unknown> | undefined,
  compression: CompressionType,
  errorBoundry: ErrorBoundary,
): Promise<{ contents: BodyInit | undefined; contentEncoding?: string }> {
  const bodyString = body ? JSON.stringify(body) : undefined;
  if (!compression || !bodyString) {
    return { contents: bodyString };
  }

  try {
    if (compression === 'gzip') {
      const { gzip } = await import('zlib');
      const compressed = await new Promise<Buffer>((resolve, reject) => {
        gzip(bodyString, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });
      return { contents: compressed, contentEncoding: 'gzip' };
    }
  } catch (e) {
    errorBoundry.logError(
      e,
      StatsigContext.new({ caller: 'getEncodedBodyAsync' }),
    );
    // Fallback to uncompressed if import or compression fails
    return { contents: bodyString };
  }

  return { contents: bodyString };
}
