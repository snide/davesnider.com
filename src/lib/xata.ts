import { XataClient } from './xata-codegen';
export const xata = new XataClient({ apiKey: import.meta.env.XATA_API_KEY });
