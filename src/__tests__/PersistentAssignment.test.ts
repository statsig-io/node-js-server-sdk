import { StatsigServer, StatsigUser } from '../index';
import {
  IUserPersistentStorage,
  StickyValues,
  UserPersistedValues,
} from '../interfaces/IUserPersistentStorage';

class TestPersistentStorage implements IUserPersistentStorage {
  public store: Record<string, UserPersistedValues> = {};
  load(key: string): UserPersistedValues {
    return this.store[key];
  }
  save(key: string, configName: string, data: StickyValues): void {
    if (!(key in this.store)) {
      this.store[key] = {};
    }
    this.store[key][configName] = data;
  }
  delete(key: string, configName: string): void {
    delete this.store[key][configName];
  }
}

describe('Persistent Assignment', () => {
  const userInControl: StatsigUser = { userID: 'vj' };
  const userInTest: StatsigUser = { userID: 'hunter2' };
  const userNotInExp: StatsigUser = { userID: 'gb' };
  const experimentName = 'the_allocated_experiment';
  const persistentStorage = new TestPersistentStorage();
  const spy = {
    load: jest.spyOn(persistentStorage, 'load'),
    save: jest.spyOn(persistentStorage, 'save'),
    delete: jest.spyOn(persistentStorage, 'delete'),
  };
  let statsig: StatsigServer;

  beforeAll(async () => {
    const configSpecs = JSON.stringify(
      require('./data/download_config_specs_sticky_experiments.json'),
    );
    statsig = new StatsigServer('secret-key', {
      bootstrapValues: configSpecs,
      userPersistentStorage: persistentStorage,
    });
    await statsig.initializeAsync();
  });

  test('Not using persistent storage', () => {
    let exp = statsig.getExperimentSync(userInControl, experimentName);
    expect(exp.getGroupName()).toEqual('Control');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');

    exp = statsig.getExperimentSync(userInTest, experimentName);
    expect(exp.getGroupName()).toEqual('Test');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');

    exp = statsig.getExperimentSync(userNotInExp, experimentName);
    expect(exp.getGroupName()).toBeNull();
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');

    expect(Object.keys(persistentStorage.store).length).toEqual(0);
    expect(spy.save).toHaveBeenCalledTimes(0);
  });

  test('Assignments saved to persistent storage', () => {
    let exp = statsig.getExperimentSync(userInControl, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(
        userInControl,
        'userID',
      ),
    });
    expect(exp.getGroupName()).toEqual('Control');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');

    exp = statsig.getExperimentSync(userInTest, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(userInTest, 'userID'),
    });
    expect(exp.getGroupName()).toEqual('Test');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');

    expect(Object.keys(persistentStorage.store).length).toEqual(2);
    expect(spy.save).toHaveBeenCalledTimes(2);
  });

  test('Evaluating from persistent assignments', () => {
    // Use sticky bucketing with valid persisted values
    // (Should override userInControl to the first evaluation of userInControl)
    let exp = statsig.getExperimentSync(userInControl, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(
        userInControl,
        'userID',
      ),
    });
    expect(exp.getGroupName()).toEqual('Control');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Persisted');

    // Use sticky bucketing with valid persisted values
    // (Should override userInTest to the first evaluation of userInTest)
    exp = statsig.getExperimentSync(userInTest, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(userInTest, 'userID'),
    });
    expect(exp.getGroupName()).toEqual('Test');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Persisted');

    // Use sticky bucketing with valid persisted values to assign a user that would otherwise be unallocated
    // (Should override userNotInExp to the first evaluation of userInControl)
    exp = statsig.getExperimentSync(userNotInExp, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(
        userInControl,
        'userID',
      ),
    });
    expect(exp.getGroupName()).toEqual('Control');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Persisted');

    // Use sticky bucketing with valid persisted values for an unallocated user
    // (Should not override since there are no persisted values)
    exp = statsig.getExperimentSync(userNotInExp, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(
        userNotInExp,
        'userID',
      ),
    });
    expect(exp.getGroupName()).toBeNull();
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');

    // Use sticky bucketing on a different ID type that hasn't been saved to storage
    // (Should not override since there are no persisted values)
    exp = statsig.getExperimentSync(userInTest, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(
        userInTest,
        'stableID',
      ),
    });
    expect(exp.getGroupName()).toEqual('Test');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');

    expect(Object.keys(persistentStorage.store).length).toEqual(2);
    expect(spy.save).toHaveBeenCalledTimes(3);
  });

  test('Assignments deleted from persistent storage', async () => {
    const configSpecs = JSON.stringify(
      require('./data/download_config_specs_sticky_experiments_inactive.json'),
    );
    statsig = new StatsigServer('secret-key', {
      bootstrapValues: configSpecs,
      userPersistentStorage: persistentStorage,
    });
    await statsig.initializeAsync();

    // Persisted assignment for inactive experiment is not used and deleted
    let exp = statsig.getExperimentSync(userInControl, experimentName, {
      userPersistedValues: statsig.getUserPersistedValues(
        userInControl,
        'userID',
      ),
    });
    expect(exp.getGroupName()).toEqual('Control');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');
    expect(
      persistentStorage.store[`${userInControl.userID}:userID`]?.[
        experimentName
      ],
    ).toBeUndefined();

    // Persisted assignment for experiment is removed if not provided during evaluation (opt-out)
    exp = statsig.getExperimentSync(userInTest, experimentName);
    expect(exp.getGroupName()).toEqual('Test');
    expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');
    expect(
      persistentStorage.store[`${userInTest.userID}:userID`]?.[experimentName],
    ).toBeUndefined();
  });

  test('Broken persistent storage', async () => {
    const brokenPersistentStorage = new BrokenPersistentStorage();
    const configSpecs = JSON.stringify(
      require('./data/download_config_specs_sticky_experiments.json'),
    );
    statsig = new StatsigServer('secret-key', {
      bootstrapValues: configSpecs,
      userPersistentStorage: brokenPersistentStorage,
    });
    await statsig.initializeAsync();

    // Does not throw
    try {
      const exp = statsig.getExperimentSync(userInControl, experimentName, {
        userPersistedValues: statsig.getUserPersistedValues(
          userInControl,
          'userID',
        ),
      });
      expect(exp.getGroupName()).toEqual('Control');
      expect(exp.getEvaluationDetails()?.reason).toEqual('Bootstrap');
    } catch {
      fail('Expected not to throw');
    }
  });
});

class BrokenPersistentStorage implements IUserPersistentStorage {
  public store: Record<string, UserPersistedValues> = {};
  load(key: string): UserPersistedValues {
    throw new Error('Invalid load');
  }
  save(key: string, configName: string, data: StickyValues): void {
    throw new Error('Invalid save');
  }
  delete(key: string, configName: string): void {
    throw new Error('Invalid delete');
  }
}
