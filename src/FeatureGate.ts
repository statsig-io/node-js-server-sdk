export type FeatureGate = {
  readonly name: string;
  readonly ruleID: string;
  readonly groupName: string | null;
  readonly value: boolean;
};

export function makeFeatureGate(
  name: string,
  ruleID: string,
  value: boolean,
  groupName: string | null,
): FeatureGate {
  return { name, ruleID, value, groupName };
}

export function makeEmptyFeatureGate(name: string): FeatureGate {
  return { name, ruleID: '', value: false, groupName: null };
}
