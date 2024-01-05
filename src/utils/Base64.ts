// Encoding logic from https://stackoverflow.com/a/246813/1524355, with slight modifications to make it work for binary strings
const KEY_STR =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export abstract class Base64 {
  static encodeArrayBuffer(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return this._encodeBinary(binary);
  }

  static _encodeBinary(value: string): string {
    let output = '';
    let chr1: number;
    let chr2: number;
    let chr3: number;
    let enc1: number;
    let enc2: number;
    let enc3: number;
    let enc4: number;
    let i = 0;

    while (i < value.length) {
      chr1 = value.charCodeAt(i++);
      chr2 = value.charCodeAt(i++);
      chr3 = value.charCodeAt(i++);

      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;

      if (isNaN(chr2)) {
        enc3 = enc4 = 64;
      } else if (isNaN(chr3)) {
        enc4 = 64;
      }

      output =
        output +
        KEY_STR.charAt(enc1) +
        KEY_STR.charAt(enc2) +
        KEY_STR.charAt(enc3) +
        KEY_STR.charAt(enc4);
    }

    return output;
  }
}
