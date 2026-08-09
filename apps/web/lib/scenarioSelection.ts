export const SELECTED_SCENARIO_STORAGE_KEY = "scenario_lab_selected_id";

export function persistSelectedScenario(scenarioId: string) {
  window.localStorage.setItem(SELECTED_SCENARIO_STORAGE_KEY, scenarioId);
  window.dispatchEvent(new Event("rise-png-scenario-change"));
}

export function getPersistedScenario(): string | null {
  return window.localStorage.getItem(SELECTED_SCENARIO_STORAGE_KEY)?.trim() || null;
}
