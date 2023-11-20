import shajs from 'sha.js';

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
  return shajs('sha256').update(name).digest('base64');
}

export function sha256Hash(name: string) {
  return shajs('sha256').update(name).digest();
}

export function hashString(
  str: string,
  algorithm: HashingAlgorithm = 'sha256',
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
  algorithm?: HashingAlgorithm,
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
