import {
  CompressFormat,
  DataAdapterKeyPath,
  getDataAdapterKey,
  IDataAdapter,
} from '../interfaces/IDataAdapter';

export type IDList = {
  creationTime: number;
  fileID: string;
  ids: Record<string, boolean>;
  readBytes: number;
  url: string;
};

export type IDListsLookupResponse = Record<
  string,
  {
    url?: string;
    fileID?: string;
    creationTime: number;
    size?: number;
  }
>;

export type IDListsLookupBootstrap = string[];

export default abstract class IDListUtil {
  // Typecheck the response from the network
  static parseLookupResponse(input: unknown): IDListsLookupResponse | null {
    if (typeof (input ?? undefined) !== 'object') {
      return null;
    }

    return input as IDListsLookupResponse;
  }

  static parseBootstrapLookup(
    input: string | object,
  ): IDListsLookupBootstrap | null {
    try {
      const result = typeof input === 'string' ? JSON.parse(input) : input;
      if (Array.isArray(result)) {
        return result as IDListsLookupBootstrap;
      }
      if (typeof result == 'object') {
        return Object.keys(result);
      }
    } catch (e) {
      /* noop */
    }
    return null;
  }

  // Run any additions/subtractions from the ID lists file
  static updateIdList(
    lists: Record<string, IDList>,
    name: string,
    data: string,
  ) {
    const lines = data.split(/\r?\n/);
    if (data.charAt(0) !== '+' && data.charAt(0) !== '-') {
      delete lists[name];
      throw new Error('Seek range invalid.');
    }

    for (const line of lines) {
      if (line.length <= 1) {
        continue;
      }

      const id = line.slice(1).trim();
      if (line.charAt(0) === '+') {
        lists[name].ids[id] = true;
      } else if (line.charAt(0) === '-') {
        delete lists[name].ids[id];
      }
    }
  }

  // Remove any old ID lists that are no longer in the Lookup
  static removeOldIdLists(
    lists: Record<string, IDList>,
    lookup: IDListsLookupResponse,
  ) {
    const deletedLists = [];
    for (const name in lists) {
      if (
        Object.prototype.hasOwnProperty.call(lists, name) &&
        !Object.prototype.hasOwnProperty.call(lookup, name)
      ) {
        deletedLists.push(name);
      }
    }

    for (const name in deletedLists) {
      delete lists[name];
    }
  }

  static async saveToDataAdapter(
    hashedSDKKey: string,
    dataAdapter: IDataAdapter,
    lists: Record<string, IDList>,
    lookup: IDListsLookupResponse,
  ): Promise<void> {
    const tasks: Promise<void>[] = [];

    for (const [key, value] of Object.entries(lists)) {
      let ids = '';
      for (const prop in value.ids) {
        if (!Object.prototype.hasOwnProperty.call(value.ids, prop)) continue;
        ids += `+${prop}\n`;
      }
      tasks.push(
        dataAdapter.set(
          getDataAdapterKey(
            hashedSDKKey,
            DataAdapterKeyPath.IDList,
            CompressFormat.PlainText,
            key,
          ),
          ids,
        ),
      );
    }

    await Promise.all(tasks);

    await dataAdapter.set(
      getDataAdapterKey(hashedSDKKey, DataAdapterKeyPath.V1IDLists),
      JSON.stringify(lookup),
    );
  }
}
