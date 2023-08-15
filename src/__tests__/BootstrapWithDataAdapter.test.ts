import StatsigServer from '../StatsigServer';
import {
  AdapterResponse,
  DataAdapterKey,
  IDataAdapter,
} from '../interfaces/IDataAdapter';
import { checkGateAndValidateWithAndWithoutServerFallbackAreConsistent } from '../test_utils/CheckGateTestUtils';
import {
  GateForConfigSpecTest,
  GatesForIdListTest,
} from './BootstrapWithDataAdapter.data';
let hitNetwork = false;
jest.mock('node-fetch', () =>
  jest.fn().mockImplementation(() => {
    hitNetwork = true;
    return Promise.resolve();
  }),
);

function makeDownloadConfigSpecsResponse(gates?: any[]) {
  return {
    time: Date.now(),
    feature_gates: gates ?? [],
    dynamic_configs: [],
    layer_configs: [],
    has_updates: true,
  };
}

class BootstrapDataAdapter implements IDataAdapter {
  private specs: string;
  private idLists: Record<string, string>;
  private idListLookup: string;

  constructor(specs: Record<string, unknown>, idLists: Record<string, string>) {
    this.specs = JSON.stringify(specs);
    this.idLists = idLists;
    this.idListLookup = JSON.stringify(Object.keys(idLists));
  }

  get(key: string): Promise<AdapterResponse> {
    switch (key) {
      case DataAdapterKey.Rulesets:
        return Promise.resolve({ result: this.specs });

      case DataAdapterKey.IDLists:
        return Promise.resolve({ result: this.idListLookup });

      default:
        const idListName = key.replace(DataAdapterKey.IDLists + '::', '');
        return Promise.resolve({ result: this.idLists[idListName] });
    }
  }

  set = () => Promise.resolve();
  initialize = () => Promise.resolve();
  shutdown = () => Promise.resolve();
}

describe('Bootstrap with DataAdapter', () => {
  beforeEach(async () => {
    hitNetwork = false;
  });

  it('makes no network calls when bootstrapping', async () => {
    const adapter = new BootstrapDataAdapter(
      makeDownloadConfigSpecsResponse(),
      {},
    );

    const statsig = new StatsigServer('secret-key', {
      dataAdapter: adapter,
    });
    await statsig.initializeAsync();

    expect(hitNetwork).toBe(false);
  });

  it('bootstraps id lists', async () => {
    const adapter = new BootstrapDataAdapter(
      makeDownloadConfigSpecsResponse(GatesForIdListTest),
      {
        /* a-user + b-user */
        user_id_list: ['+Z/hEKLio', '+M5m6a10x'].join('\n'),
      },
    );

    const statsig = new StatsigServer('secret-key', {
      dataAdapter: adapter,
    });
    await statsig.initializeAsync();

    await Promise.all(
      [
        {
          user: { userID: 'a-user' },
          expectedValue: true,
        },
        {
          user: { userID: 'b-user' },
          expectedValue: true,
        },
        {
          user: { userID: 'c-user' },
          expectedValue: false,
        },
      ].map(
        async ({ user, expectedValue }) =>
          await checkGateAndValidateWithAndWithoutServerFallbackAreConsistent(
            statsig,
            user,
            'test_id_list',
            expectedValue,
          ),
      ),
    );
  });

  it('bootstraps config specs', async () => {
    const adapter = new BootstrapDataAdapter(
      makeDownloadConfigSpecsResponse(GateForConfigSpecTest),
      {},
    );

    const statsig = new StatsigServer('secret-key', {
      dataAdapter: adapter,
    });
    await statsig.initializeAsync();

    await checkGateAndValidateWithAndWithoutServerFallbackAreConsistent(
      statsig,
      { userID: 'a-user' },
      'test_public',
      true,
    );
  });
});
