import { EvaluationDetails } from './EvaluationDetails';

export default class ConfigEvaluation {
  public value: boolean;
  public rule_id: string;
  public secondary_exposures: Record<string, string>[];
  public json_value: Record<string, unknown>;
  public explicit_parameters: string[] | null;
  public config_delegate: string | null;
  public unsupported: boolean;
  public undelegated_secondary_exposures: Record<string, string>[] | undefined;
  public is_experiment_group: boolean;
  public group_name: string | null;
  public evaluation_details: EvaluationDetails | undefined;
  public id_type: string | null;

  constructor(
    value: boolean,
    rule_id = '',
    group_name: string | null = null,
    id_type: string | null = null,
    secondary_exposures: Record<string, string>[] = [],
    json_value: Record<string, unknown> | boolean = {},
    explicit_parameters: string[] | null = null,
    config_delegate: string | null = null,
    unsupported = false,
  ) {
    this.value = value;
    this.rule_id = rule_id;
    if (typeof json_value === 'boolean') {
      // handle legacy gate case
      this.json_value = {};
    } else {
      this.json_value = json_value;
    }
    this.secondary_exposures = secondary_exposures;
    this.undelegated_secondary_exposures = secondary_exposures;
    this.config_delegate = config_delegate;
    this.unsupported = unsupported;
    this.explicit_parameters = explicit_parameters;
    this.is_experiment_group = false;
    this.group_name = group_name;
    this.id_type = id_type;
  }

  public withEvaluationDetails(
    evaulationDetails: EvaluationDetails,
  ): ConfigEvaluation {
    this.evaluation_details = evaulationDetails;
    return this;
  }

  public setIsExperimentGroup(isExperimentGroup = false) {
    this.is_experiment_group = isExperimentGroup;
  }

  public static unsupported(configSyncTime: number, initialUpdateTime: number) {
    return new ConfigEvaluation(
      false,
      '',
      null,
      null,
      [],
      {},
      undefined,
      undefined,
      true,
    ).withEvaluationDetails(
      EvaluationDetails.unsupported(configSyncTime, initialUpdateTime),
    );
  }
}
