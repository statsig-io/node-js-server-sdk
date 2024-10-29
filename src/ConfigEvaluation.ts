import { EvaluationDetails } from './EvaluationDetails';
import type { StickyValues } from './interfaces/IUserPersistentStorage';
import { SecondaryExposure } from './LogEvent';

export default class ConfigEvaluation {
  public value: boolean;
  public rule_id: string;
  public secondary_exposures: SecondaryExposure[];
  public json_value: Record<string, unknown>;
  public explicit_parameters: string[] | null;
  public config_delegate: string | null;
  public unsupported: boolean;
  public undelegated_secondary_exposures: SecondaryExposure[];
  public is_experiment_group: boolean;
  public group_name: string | null;
  public evaluation_details: EvaluationDetails | undefined;
  public id_type: string | null;
  public configVersion?: number | undefined;

  constructor(
    value: boolean,
    rule_id = '',
    group_name: string | null = null,
    id_type: string | null = null,
    secondary_exposures: SecondaryExposure[] = [],
    json_value: Record<string, unknown> | boolean = {},
    explicit_parameters: string[] | null = null,
    config_delegate: string | null = null,
    configVersion?: number,
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
    this.configVersion = configVersion;
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

  public static unsupported(
    configSyncTime: number,
    initialUpdateTime: number,
    version: number | undefined,
  ): ConfigEvaluation {
    return new ConfigEvaluation(
      false,
      '',
      null,
      null,
      [],
      {},
      undefined,
      undefined,
      version,
      true,
    ).withEvaluationDetails(
      EvaluationDetails.unsupported(configSyncTime, initialUpdateTime),
    );
  }

  public toStickyValues(): StickyValues {
    return {
      value: this.value,
      json_value: this.json_value,
      rule_id: this.rule_id,
      group_name: this.group_name,
      secondary_exposures: this.secondary_exposures,
      undelegated_secondary_exposures: this.undelegated_secondary_exposures,
      config_delegate: this.config_delegate,
      explicit_parameters: this.explicit_parameters,
      time: this.evaluation_details?.configSyncTime ?? Date.now(),
      configVersion: this.configVersion,
    };
  }

  public static fromStickyValues(
    stickyValues: StickyValues,
    initialUpdateTime: number,
  ): ConfigEvaluation {
    const evaluation = new ConfigEvaluation(
      stickyValues.value,
      stickyValues.rule_id,
      stickyValues.group_name,
      null,
      stickyValues.secondary_exposures,
      stickyValues.json_value,
      stickyValues.explicit_parameters,
      stickyValues.config_delegate,
      stickyValues.configVersion,
    );
    evaluation.evaluation_details = EvaluationDetails.persisted(
      stickyValues.time,
      initialUpdateTime,
    );
    evaluation.undelegated_secondary_exposures =
      stickyValues.undelegated_secondary_exposures;
    evaluation.is_experiment_group = true;

    return evaluation;
  }
}
