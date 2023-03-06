// Generated by Xata Codegen 0.22.3. Please do not edit.
import { buildClient } from "@xata.io/client";
import type {
  BaseClientOptions,
  SchemaInference,
  XataRecord,
} from "@xata.io/client";

const tables = [
  {
    name: "search",
    columns: [
      { name: "title", type: "string" },
      { name: "description", type: "text" },
      { name: "astroId", type: "string", unique: true },
      { name: "pubDate", type: "datetime" },
      { name: "tags", type: "multiple" },
      { name: "body", type: "text" },
    ],
  },
] as const;

export type SchemaTables = typeof tables;
export type InferredTypes = SchemaInference<SchemaTables>;

export type Search = InferredTypes["search"];
export type SearchRecord = Search & XataRecord;

export type DatabaseSchema = {
  search: SearchRecord;
};

const DatabaseClient = buildClient();

const defaultOptions = {
  databaseURL:
    "https://Dave-Snider-s-workspace-fobrui.us-east-1.xata.sh/db/davesnidercom",
};

export class XataClient extends DatabaseClient<DatabaseSchema> {
  constructor(options?: BaseClientOptions) {
    super({ ...defaultOptions, ...options }, tables);
  }
}

let instance: XataClient | undefined = undefined;

export const getXataClient = () => {
  if (instance) return instance;

  instance = new XataClient();
  return instance;
};
