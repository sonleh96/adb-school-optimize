"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { getAuthenticatedAssetUrl, fetchScenarios, runScenario, updateScenario } from "@/lib/api";
import { useScenariosQuery, useSchoolsQuery } from "@/lib/hooks";
import { queryKeys } from "@/lib/queryKeys";
import { SELECTED_SCENARIO_STORAGE_KEY } from "@/lib/scenarioSelection";
import { displayWeightLabel, normalizeWeightOverrides, type WeightOverrides } from "@/lib/scenarioWeights";
import { VirtualizedSchoolTable } from "@/components/VirtualizedSchoolTable";
import type { ScenarioRecord } from "@/lib/types";

const DEFAULT_OVERRIDES: WeightOverrides = {
  need: { S: 0.55, A: 0.25, R_phys: 0.2 },
  priority: { Need: 0.7, I: 0.2, P: 0.1 },
};

const WRITE_OPERATIONS_ENABLED = process.env.NEXT_PUBLIC_WRITE_OPERATIONS_ENABLED === "true";

export function ScenarioPanel() {
  const queryClient = useQueryClient();
  const scenariosQuery = useScenariosQuery();
  const scenarios = useMemo(() => scenariosQuery.data ?? [], [scenariosQuery.data]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("Scenario Lab Run");
  const [description, setDescription] = useState("Interactive run from frontend scaffold.");
  const [weightOverrides, setWeightOverrides] = useState<WeightOverrides>(DEFAULT_OVERRIDES);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveConfirmationId, setArchiveConfirmationId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const previewQuery = useSchoolsQuery({
    scenarioId: selectedScenarioId ?? undefined,
    limit: 10000,
    enabled: Boolean(selectedScenarioId),
  });
  const previewRows = selectedScenarioId ? (previewQuery.data ?? []) : [];
  const loadingPreview = previewQuery.isLoading || previewQuery.isFetching;

  const scenarioCountLabel = useMemo(() => `${scenarios.length} saved scenarios`, [scenarios.length]);
  const editableWeightGroups = useMemo(() => buildEditableWeightGroups(weightOverrides), [weightOverrides]);
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenario_id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId]
  );
  const isDirty = useMemo(() => {
    if (!selectedScenario) return false;
    return (
      scenarioName.trim() !== selectedScenario.scenario_name ||
      description.trim() !== (selectedScenario.description ?? "") ||
      JSON.stringify(normalizeWeightOverrides(weightOverrides)) !==
        JSON.stringify(normalizeWeightOverrides(selectedScenario.weights))
    );
  }, [description, scenarioName, selectedScenario, weightOverrides]);

  useEffect(() => {
    if (scenariosQuery.error) {
      setError(
        scenariosQuery.error instanceof Error
          ? scenariosQuery.error.message
          : "Failed to initialize Scenario Lab."
      );
    }
  }, [scenariosQuery.error]);

  useEffect(() => {
    if (initialized || !scenariosQuery.isSuccess) return;
    const persistedId = window.localStorage.getItem(SELECTED_SCENARIO_STORAGE_KEY);
    if (persistedId) {
      const persistedScenario = scenarios.find((scenario) => scenario.scenario_id === persistedId);
      if (persistedScenario) {
        applyScenario(persistedScenario, false);
        setInitialized(true);
        return;
      }
    }
    setInitialized(true);
  }, [initialized, scenarios, scenariosQuery.isSuccess]);

  function applyScenario(scenario: ScenarioRecord, announce = true) {
    setSelectedScenarioId(scenario.scenario_id);
    setScenarioName(scenario.scenario_name);
    setDescription(scenario.description ?? "");
    setWeightOverrides(normalizeWeightOverrides(scenario.weights, DEFAULT_OVERRIDES));
    window.localStorage.setItem(SELECTED_SCENARIO_STORAGE_KEY, scenario.scenario_id);
    if (announce) {
      setStatus(`Loaded scenario "${scenario.scenario_name}".`);
    }
  }

  async function loadScenario(scenario: ScenarioRecord) {
    setArchiveConfirmationId(null);
    applyScenario(scenario);
  }

  async function refreshScenarios() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.scenarios });
    return queryClient.fetchQuery({ queryKey: queryKeys.scenarios, queryFn: fetchScenarios });
  }

  async function handleSaveChanges() {
    if (!selectedScenario || !isDirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateScenario(selectedScenario.scenario_id, {
        scenario_name: scenarioName.trim(),
        description: description.trim(),
        weights: weightOverrides,
      });
      await refreshScenarios();
      applyScenario(updated, false);
      setStatus(`Updated scenario "${updated.scenario_name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update scenario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(scenario: ScenarioRecord) {
    if (archiveConfirmationId !== scenario.scenario_id) {
      setArchiveConfirmationId(scenario.scenario_id);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateScenario(scenario.scenario_id, { archived: true });
      await refreshScenarios();
      if (selectedScenarioId === scenario.scenario_id) {
        setSelectedScenarioId(null);
        window.localStorage.removeItem(SELECTED_SCENARIO_STORAGE_KEY);
      }
      setArchiveConfirmationId(null);
      setStatus(`Archived scenario "${scenario.scenario_name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive scenario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunScenario() {
    setRunning(true);
    setError(null);
    setStatus(null);
    try {
      const result = await runScenario({
        scenario_name: scenarioName,
        description,
        weight_overrides: weightOverrides,
        persist: true,
        is_default: false,
        created_by: "frontend",
      });

      setWarnings(result.warnings);
      setStatus(
        result.scenario
          ? `Saved scenario "${result.scenario.scenario_name}" and refreshed all school results.`
          : "Ran scenario without persistence."
      );

      await queryClient.invalidateQueries({ queryKey: queryKeys.scenarios });
      const latest = await queryClient.fetchQuery({
        queryKey: queryKeys.scenarios,
        queryFn: fetchScenarios,
      });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });

      if (result.scenario) {
        const saved = latest.find((scenario) => scenario.scenario_id === result.scenario?.scenario_id);
        if (saved) {
          applyScenario(saved, false);
        } else {
          setSelectedScenarioId(result.scenario.scenario_id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run scenario.");
    } finally {
      setRunning(false);
    }
  }

  function updateWeight(groupKey: string, entryKey: string, nextPercent: number) {
    setWeightOverrides((current) => {
      const group = current[groupKey];
      if (!group) return current;
      const keys = Object.keys(group);
      if (!keys.includes(entryKey)) return current;

      const clamped = clamp(nextPercent / 100, 0, 1);
      if (keys.length === 1) {
        return {
          ...current,
          [groupKey]: { [entryKey]: 1 },
        };
      }

      const remaining = clamp(1 - clamped, 0, 1);
      const otherKeys = keys.filter((key) => key !== entryKey);
      const othersTotal = otherKeys.reduce((sum, key) => sum + finite(group[key]), 0);

      const nextGroup: Record<string, number> = { ...group, [entryKey]: clamped };
      if (othersTotal <= 0) {
        const evenShare = remaining / otherKeys.length;
        for (const key of otherKeys) nextGroup[key] = evenShare;
      } else {
        for (const key of otherKeys) nextGroup[key] = (finite(group[key]) / othersTotal) * remaining;
      }

      return {
        ...current,
        [groupKey]: nextGroup,
      };
    });
  }

  function resetGroup(groupKey: string) {
    const defaults = normalizeWeightOverrides(DEFAULT_OVERRIDES);
    setWeightOverrides((current) => {
      if (defaults[groupKey]) {
        return { ...current, [groupKey]: defaults[groupKey] };
      }
      const existing = current[groupKey];
      if (!existing) return current;
      const keys = Object.keys(existing);
      if (!keys.length) return current;
      const evenShare = 1 / keys.length;
      const normalized = Object.fromEntries(keys.map((key) => [key, evenShare]));
      return { ...current, [groupKey]: normalized };
    });
  }

  function resetAll() {
    setWeightOverrides(normalizeWeightOverrides(DEFAULT_OVERRIDES));
  }

  return (
    <div className="doc-workspace">
      <div className="doc-workspace-inner" style={{ width: "min(1200px, calc(100% - 32px))" }}>
        <section className="float-panel scenario-lab">
          <div className="float-panel-head">
            <div>
              <h2 className="float-panel-title">Scenario Lab</h2>
              <p className="float-panel-subtitle">
                Run persisted scoring scenarios against the seeded school dataset using interactive weight
                controls.
              </p>
            </div>
            <div className="scenario-data-actions">
              <p className="scenario-data-label">Data</p>
              <div className="scenario-data-buttons">
                <a className="button button-secondary" href={getAuthenticatedAssetUrl("exports/scores.xlsx")}>
                  Scores
                </a>
                <a className="button button-secondary" href={getAuthenticatedAssetUrl("exports/full.xlsx")}>
                  Full
                </a>
              </div>
            </div>
          </div>

          <div className="float-panel-body scenario-lab-body">
            <div className="two-up">
              <article className="panel scenario-run-panel">
                <div className="panel-head">
                  <div>
                    <h3 className="panel-title">Run A Scenario</h3>
                    <p className="panel-subtitle">Submit weight overrides to the FastAPI scoring endpoint.</p>
                  </div>
                </div>
                <div className="panel-body scenario-run-panel-body">
                  <div className="controls">
                    <div className="control" style={{ minWidth: "100%" }}>
                      <label htmlFor="scenarioName">Scenario name</label>
                      <input
                        id="scenarioName"
                        value={scenarioName}
                        onChange={(event) => setScenarioName(event.target.value)}
                      />
                    </div>
                    <div className="control" style={{ minWidth: "100%" }}>
                      <label htmlFor="scenarioDescription">Description</label>
                      <input
                        id="scenarioDescription"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                      />
                    </div>
                    <div className="action-row">
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={handleRunScenario}
                        disabled={running || !WRITE_OPERATIONS_ENABLED}
                        title={
                          WRITE_OPERATIONS_ENABLED
                            ? undefined
                            : "Scenario writes are disabled in research-only mode."
                        }
                      >
                        {running
                          ? "Running…"
                          : WRITE_OPERATIONS_ENABLED
                            ? "Run And Save Scenario"
                            : "Scenario Runs Disabled"}
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleSaveChanges}
                        disabled={saving || !WRITE_OPERATIONS_ENABLED || !isDirty}
                      >
                        {saving ? "Saving…" : "Save selected changes"}
                      </button>
                    </div>
                    {!WRITE_OPERATIONS_ENABLED ? (
                      <p className="small-copy research-mode-copy">
                        Saved scenario runs are disabled until authentication and data-governance controls are
                        approved.
                      </p>
                    ) : null}
                    <div className="control" style={{ minWidth: "100%" }}>
                      <label>Weight Builder</label>
                      <div className="scenario-weight-builder-header">
                        <p className="small-copy">
                          Use sliders or percentage inputs. Each group automatically sums to 100%.
                        </p>
                        <button className="button button-secondary" type="button" onClick={resetAll}>
                          Reset all
                        </button>
                      </div>
                      <div className="scenario-weight-builder">
                        {editableWeightGroups.map((group) => (
                          <article className="detail-card scenario-weight-editor-card" key={group.key}>
                            <div className="scenario-weight-editor-card-head">
                              <div>
                                <h4>{group.label}</h4>
                                <span className="scenario-weight-sum">
                                  Total{" "}
                                  {group.entries.reduce((sum, entry) => sum + entry.percent, 0).toFixed(1)}%
                                </span>
                              </div>
                              <button
                                className="button button-secondary"
                                type="button"
                                onClick={() => resetGroup(group.key)}
                              >
                                Reset group
                              </button>
                            </div>
                            <div className="scenario-weight-editor-list">
                              {group.entries.map((entry) => (
                                <div className="scenario-weight-editor-row" key={`${group.key}-${entry.key}`}>
                                  <label className="scenario-weight-editor-label">{entry.label}</label>
                                  <input
                                    className="scenario-weight-slider"
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    value={entry.percent}
                                    onChange={(event) =>
                                      updateWeight(group.key, entry.key, Number(event.target.value))
                                    }
                                  />
                                  <input
                                    className="scenario-weight-number"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    value={entry.percent.toFixed(1)}
                                    onChange={(event) =>
                                      updateWeight(group.key, entry.key, Number(event.target.value))
                                    }
                                  />
                                  <span className="scenario-weight-percent">%</span>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                  {isDirty ? <p className="small-copy">Unsaved changes to the selected scenario.</p> : null}
                  {status ? (
                    <p className="small-copy" role="status">
                      {status}
                    </p>
                  ) : null}
                  {warnings.length ? (
                    <div className="empty">
                      <strong>Warnings</strong>
                      <ul className="methodology-list">
                        {warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {error ? <div className="error">{error}</div> : null}
                </div>
              </article>

              <div className="sidebar-stack">
                <article className="panel">
                  <div className="panel-head">
                    <div>
                      <h3 className="panel-title">Saved Scenarios</h3>
                      <p className="panel-subtitle">{scenarioCountLabel}</p>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="table-wrap table-wrap-scroll scenario-saved-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Default</th>
                            <th>Updated</th>
                            <th aria-label="Download column" />
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarios.map((scenario) => (
                            <tr
                              className="data-row"
                              key={scenario.scenario_id}
                              data-selected={scenario.scenario_id === selectedScenarioId}
                            >
                              <td>
                                <button
                                  className="scenario-select-button"
                                  type="button"
                                  onClick={() => void loadScenario(scenario)}
                                  aria-pressed={scenario.scenario_id === selectedScenarioId}
                                >
                                  {scenario.scenario_name}
                                </button>
                              </td>
                              <td>{scenario.is_default ? "Yes" : "No"}</td>
                              <td>
                                {scenario.updated_at ? new Date(scenario.updated_at).toLocaleString() : "n/a"}
                              </td>
                              <td className="download-cell">
                                <a
                                  className="icon-download-link"
                                  href={getAuthenticatedAssetUrl(
                                    `exports/scores.xlsx?scenario_id=${scenario.scenario_id}`
                                  )}
                                  title={`Download ${scenario.scenario_name}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Download className="size-4" aria-hidden />
                                  <span className="sr-only">Download {scenario.scenario_name}</span>
                                </a>
                              </td>
                              <td>
                                <button
                                  className="button button-secondary scenario-archive-button"
                                  type="button"
                                  disabled={saving || scenario.is_default || !WRITE_OPERATIONS_ENABLED}
                                  onClick={() => void handleArchive(scenario)}
                                  title={
                                    scenario.is_default ? "Default scenarios cannot be archived." : undefined
                                  }
                                >
                                  {archiveConfirmationId === scenario.scenario_id
                                    ? "Confirm archive"
                                    : "Archive"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-head">
                    <div>
                      <h3 className="panel-title">Scenario Result Preview</h3>
                      <p className="panel-subtitle">All schools for the selected scenario result set.</p>
                    </div>
                  </div>
                  <div className="panel-body">
                    {loadingPreview ? (
                      <div className="loading">Loading scenario results…</div>
                    ) : previewRows.length ? (
                      <div className="scenario-preview-wrap" style={{ height: 420 }}>
                        <VirtualizedSchoolTable
                          schools={previewRows}
                          selectedSchoolId={null}
                          onSelectSchool={() => undefined}
                        />
                      </div>
                    ) : (
                      <div className="empty">
                        Run or select a scenario to preview all recalculated school results.
                      </div>
                    )}
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

type EditableWeightGroup = {
  key: string;
  label: string;
  entries: Array<{ key: string; label: string; percent: number }>;
};

function buildEditableWeightGroups(weights: WeightOverrides): EditableWeightGroup[] {
  return Object.entries(weights).map(([groupKey, group]) => ({
    key: groupKey,
    label: toStartCase(groupKey),
    entries: Object.entries(group).map(([entryKey, entryValue]) => ({
      key: entryKey,
      label: displayWeightLabel(entryKey),
      percent: roundToOneDecimal(finite(entryValue) * 100),
    })),
  }));
}

function parseFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function finite(value: unknown): number {
  const parsed = parseFinite(value);
  return parsed == null ? 0 : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function toStartCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
