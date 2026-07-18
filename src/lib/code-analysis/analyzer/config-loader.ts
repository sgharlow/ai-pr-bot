/**
 * ConfigLoader — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by
 * src/lib/code-analysis/analyzer/code-analyzer.ts: mergeWithDefaults(),
 * findAndLoadConfig(), loadFromFile().
 *
 * Defaults (documented, conservative):
 * - enablePrivacyGuard: true  (self-contained, no external tooling)
 * - enableTreeSitter:  false  (the restored structure scanner is heuristic — opt-in)
 * - enableSemgrep:     false  (requires the external semgrep CLI — opt-in)
 *
 * HONEST LIMIT: config files are loaded from `.ai-review.json` (JSON). The
 * AIReviewConfig type references `.ai-review.yml`, but no YAML parser is declared
 * in package.json and the compile repair adds no dependencies; if a `.ai-review.yml`
 * is found, loading throws a descriptive error (surfaced in the analyzer's
 * result.errors) instead of silently ignoring the user's config.
 */

import { access, readFile } from 'fs/promises';
import * as path from 'path';
import { CodeAnalysisConfig, AIReviewConfig } from './types';

const DEFAULTS: CodeAnalysisConfig = {
  enablePrivacyGuard: true,
  enableTreeSitter: false,
  enableSemgrep: false,
  minSeverity: 'low',
  maxFindings: 100,
  collectMetrics: true
};

const JSON_CONFIG_FILENAME = '.ai-review.json';
const YAML_CONFIG_FILENAME = '.ai-review.yml';

export class ConfigLoader {
  static mergeWithDefaults(config: Partial<CodeAnalysisConfig>): CodeAnalysisConfig {
    return { ...DEFAULTS, ...config };
  }

  /**
   * Walk up from the file's directory looking for a config file.
   * Returns defaults (configPath undefined) when none is found.
   */
  static async findAndLoadConfig(
    filePath: string
  ): Promise<{ config: CodeAnalysisConfig; configPath?: string }> {
    let dir = path.resolve(path.dirname(filePath));

    // Bounded walk to filesystem root.
    for (;;) {
      const jsonPath = path.join(dir, JSON_CONFIG_FILENAME);
      if (await ConfigLoader.exists(jsonPath)) {
        return { config: await ConfigLoader.loadFromFile(jsonPath), configPath: jsonPath };
      }

      const yamlPath = path.join(dir, YAML_CONFIG_FILENAME);
      if (await ConfigLoader.exists(yamlPath)) {
        throw new Error(
          `${yamlPath}: YAML config parsing is not available (no YAML dependency in this build). ` +
          `Convert the file to ${JSON_CONFIG_FILENAME}.`
        );
      }

      const parent = path.dirname(dir);
      if (parent === dir) {
        return { config: ConfigLoader.mergeWithDefaults({}) };
      }
      dir = parent;
    }
  }

  static async loadFromFile(configPath: string): Promise<CodeAnalysisConfig> {
    if (configPath.endsWith('.yml') || configPath.endsWith('.yaml')) {
      throw new Error(
        `${configPath}: YAML config parsing is not available (no YAML dependency in this build). ` +
        `Convert the file to ${JSON_CONFIG_FILENAME}.`
      );
    }

    const raw = await readFile(configPath, 'utf-8');
    let parsed: Partial<AIReviewConfig>;
    try {
      parsed = JSON.parse(raw);
    } catch (error: any) {
      throw new Error(`${configPath}: invalid JSON (${error.message})`);
    }

    return ConfigLoader.mergeWithDefaults(ConfigLoader.fromAIReviewConfig(parsed));
  }

  /** Map the .ai-review file schema (AIReviewConfig) onto CodeAnalysisConfig. */
  private static fromAIReviewConfig(file: Partial<AIReviewConfig>): Partial<CodeAnalysisConfig> {
    const config: Partial<CodeAnalysisConfig> = {};

    if (file.severityThreshold !== undefined) {
      config.minSeverity = file.severityThreshold;
    }

    const analysis = file.analysis;
    if (analysis?.privacyGuard?.enabled !== undefined) {
      config.enablePrivacyGuard = analysis.privacyGuard.enabled;
    }
    if (analysis?.privacyGuard?.configPath !== undefined) {
      config.privacyGuardConfig = analysis.privacyGuard.configPath;
    }
    if (analysis?.treeSitter?.enabled !== undefined) {
      config.enableTreeSitter = analysis.treeSitter.enabled;
    }
    if (analysis?.semgrep?.enabled !== undefined) {
      config.enableSemgrep = analysis.semgrep.enabled;
    }
    if (analysis?.semgrep) {
      const rules = analysis.semgrep.rules;
      config.semgrepConfig = {
        ...(rules !== undefined
          ? { rulesPath: Array.isArray(rules) ? rules[0] : rules }
          : {}),
        ...(analysis.semgrep.excludeRules !== undefined
          ? { excludeRules: analysis.semgrep.excludeRules }
          : {}),
        ...(analysis.semgrep.severity !== undefined
          ? { severityLevels: analysis.semgrep.severity }
          : {})
      };
    }

    // Preserve the rest of the file for consumers that read customConfig.
    config.customConfig = file as Record<string, any>;

    return config;
  }

  private static async exists(p: string): Promise<boolean> {
    try {
      await access(p);
      return true;
    } catch {
      return false;
    }
  }
}
