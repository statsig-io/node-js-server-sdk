type InputType = string | ArrayBuffer;
type gzipSyncType = (buf: InputType) => Buffer;

let zlib: any = null;
try {
  zlib = require('zlib');
} catch (err) {
  // Ignore
}

export default function getCompressionFunc(): gzipSyncType | null {
  if (zlib) {
    return zlib.gzipSync;
  } else {
    return null;
  }
}
