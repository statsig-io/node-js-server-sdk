function fasthash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const character = value.charCodeAt(i);
    hash = (hash << 5) - hash + character;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

function djb2Hash(value: string): string {
  return String(fasthash(value) >>> 0);
}

export function djb2HashForObject(
  object: Record<string, unknown> | null,
): string {
  return djb2Hash(JSON.stringify(getSortedObject(object)));
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
