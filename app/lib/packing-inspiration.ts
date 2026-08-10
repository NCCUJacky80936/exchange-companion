import inspirationData from "../../config/packing-inspiration.json";

export interface PackingInspirationSource {
  id: string;
  label: string;
  url: string;
}

export const packingInspiration = inspirationData as {
  schemaVersion: 1;
  experienceOnly: true;
  sources: PackingInspirationSource[];
};
