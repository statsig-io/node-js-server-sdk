import { Base64 } from './Base64';
import { SHA256 } from './Sha256';

export type HashingAlgorithm = 'sha256' | 'djb2' | 'none';

function fasthash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const character = value.charCodeAt(i);
    hash = (hash << 5) - hash + character;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

export function djb2Hash(value: string): string {
  return String(fasthash(value) >>> 0);
}

export function djb2HashForObject(
  object: Record<string, unknown> | null,
): string {
  return djb2Hash(JSON.stringify(getSortedObject(object)));
}

export function sha256HashBase64(name: string) {
  const buffer = SHA256(name);
  return Base64.encodeArrayBuffer(buffer.arrayBuffer());
}

export function sha256Hash(name: string): DataView {
  return SHA256(name).dataView();
}

export function hashString(
  str: string,
  algorithm: HashingAlgorithm = 'djb2',
): string {
  switch (algorithm) {
    case 'sha256':
      return sha256HashBase64(str);
    case 'djb2':
      return djb2Hash(str);
    default:
      return str;
  }
}

export function hashUnitIDForIDList(
  unitID: string,
  algorithm: HashingAlgorithm = 'sha256', // Big idlists blob use sha256 for hashing
) {
  if (typeof unitID !== 'string' || unitID == null) {
    return '';
  }
  return hashString(unitID, algorithm).substr(0, 8);
}

function getSortedObject(
  object: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (object == null) {
    return null;
  }
  const keys = Object.keys(object).sort();
  const sortedObject: Record<string, unknown> = {};
  keys.forEach((key) => {
    let value = object[key];
    if (value instanceof Object) {
      value = getSortedObject(value as Record<string, unknown>);
    }

    sortedObject[key] = value;
  });
  return sortedObject;
}
