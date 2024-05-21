import type { EvaluationDetails } from './EvaluationDetails';

export type FeatureGate = {
  readonly name: string;
  readonly ruleID: string;
  readonly groupName: string | null;
  readonly idType: string | null;
  readonly value: boolean;
  readonly evaluationDetails: EvaluationDetails | null;
};

export function makeFeatureGate(
  name: string,
  ruleID: string,
  value: boolean,
  groupName: string | null,
  idType: string | null,
  evaluationDetails: EvaluationDetails | null,
): FeatureGate {
  return { name, ruleID, value, groupName, idType, evaluationDetails };
}

export function makeEmptyFeatureGate(name: string): FeatureGate {
  return {
    name,
    ruleID: '',
    value: false,
    groupName: null,
    idType: null,
    evaluationDetails: null,
  };
}
