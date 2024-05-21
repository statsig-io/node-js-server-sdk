export type FeatureGate = {
  readonly name: string;
  readonly ruleID: string;
  readonly groupName: string | null;
  readonly idType: string | null;
  readonly value: boolean;
};

export function makeFeatureGate(
  name: string,
  ruleID: string,
  value: boolean,
  groupName: string | null,
  idType: string | null,
): FeatureGate {
  return { name, ruleID, value, groupName, idType };
}

export function makeEmptyFeatureGate(name: string): FeatureGate {
  return { name, ruleID: '', value: false, groupName: null, idType: null };
}
