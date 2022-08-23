import { IDList } from "../SpecStore";

export interface IIDListAdapter {
  getIDLists(): Record<string, IDList> | null;
  setIDLists(idLists: Record<string, IDList>): void;
}