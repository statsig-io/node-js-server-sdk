import ErrorBoundary from '../ErrorBoundary';
import { StatsigContext } from './StatsigContext';

export function isValidCompressionType(
  input: unknown,
): input is CompressionType {
  return (
    typeof input === 'string' &&
    (VALID_COMPRESSION_TYPES as ReadonlyArray<string>).includes(input)
  );
}

const VALID_COMPRESSION_TYPES = ['gzip', 'zstd', 'none'] as const;
export type CompressionType = (typeof VALID_COMPRESSION_TYPES)[number];

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

    if (compression === 'zstd') {
      const { compress } = await import('@mongodb-js/zstd');
      const compressed = await compress(Buffer.from(bodyString, 'utf8'));
      return { contents: compressed, contentEncoding: 'zstd' };
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
