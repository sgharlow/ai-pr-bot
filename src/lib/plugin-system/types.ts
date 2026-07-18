/**
 * Plugin-system types — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/queue-system/types.ts, which
 * uses only `PluginResult` (as `FixGenerationJobData.analysisResults?: PluginResult[]`).
 *
 * No code in the repo reads PluginResult's fields, so this is a conservative generic
 * result envelope. The plugin system itself was never committed; this file exists to
 * satisfy the type contract, not to fake a plugin runtime.
 */

export interface PluginResult {
  /** Name of the plugin that produced this result */
  pluginName: string;

  /** Whether the plugin run succeeded */
  success: boolean;

  /** Plugin-specific output (findings, metrics, etc.) — shape owned by the plugin */
  data?: unknown;

  /** Error message when success is false */
  error?: string;

  /** Wall-clock duration of the plugin run in milliseconds */
  durationMs?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
