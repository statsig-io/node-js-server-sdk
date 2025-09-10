import { bigqueryHash, sha256HashBase64 } from './Hashing';

export function compute_user_key(
  userId: string | null | undefined,
  customIds: Record<string, string> | null | undefined,
): string {
  let userKey = `u:${userId || ''};`;

  if (customIds) {
    for (const [k, v] of Object.entries(customIds)) {
      userKey += `${k}:${v};`;
    }
  }

  return userKey;
}

export function compute_dedupe_key_for_gate(
  name: string,
  ruleId: string,
  booleanValue: boolean,
  userId: string | null | undefined,
  customIds: Record<string, string> | null | undefined,
): string {
  const userKey = compute_user_key(userId, customIds);
  const exposureKey = `n:${name};${userKey}r:${ruleId};v:${String(booleanValue)}`;
  return exposureKey;
}

export function compute_dedupe_key_for_config(
  name: string,
  ruleId: string,
  userId: string | null | undefined,
  customIds: Record<string, string> | null | undefined,
): string {
  const userKey = compute_user_key(userId, customIds);
  const exposureKey = `n:${name};${userKey}r:${ruleId}`;
  return exposureKey;
}

export function compute_dedupe_key_for_layer(
  name: string,
  allocatedExperiment: string,
  paramName: string,
  ruleId: string,
  userId: string | null | undefined,
  customIds: Record<string, string> | null | undefined,
): string {
  const userKey = compute_user_key(userId, customIds);
  const exposureKey = `n:${name};e:${allocatedExperiment};p:${paramName};${userKey}r:${ruleId}`;
  return exposureKey;
}

export function is_hash_in_sampling_rate(
  exposureKey: string,
  samplingRate: number,
): boolean {
  const hash = bigqueryHash(exposureKey);
  return hash % BigInt(samplingRate) === BigInt(0);
}
