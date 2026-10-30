import type { AtsAdapter } from "../core/types";
import { workdayAdapter } from "./workday/adapter";

// Adding an ATS: create src/ats/<name>/, then add its adapter here and its host to manifest.config.ts.
export const ADAPTERS: readonly AtsAdapter[] = [workdayAdapter];

export function findAdapter(url: URL): AtsAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}
