/**
 * Semgrep integration — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by
 * src/lib/code-analysis/analyzer/code-analyzer.ts: createSemgrep(),
 * createMockSemgrep(), Semgrep.analyze(content, language, config).
 *
 * createSemgrep() wraps the external `semgrep` CLI (--json over a temp file). It
 * throws a descriptive error from analyze() when the CLI is not installed — the
 * analyzer already catches per-analyzer errors into result.errors, which is the
 * honest failure mode (no silent empty results pretending a scan happened).
 * enableSemgrep defaults to false in ConfigLoader; this path is opt-in and has
 * not been exercised against a live semgrep install (wired, not live-proven).
 *
 * createMockSemgrep() returns no findings and is used when NODE_ENV === 'test'
 * (existing analyzer behavior).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface SemgrepConfig {
  rulesPath?: string;
  includeRules?: string[];
  excludeRules?: string[];
  severityLevels?: ('ERROR' | 'WARNING' | 'INFO')[];
}

export interface SemgrepFinding {
  ruleId: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  codeSnippet?: string;
}

export interface Semgrep {
  analyze(content: string, language?: string, config?: SemgrepConfig): Promise<SemgrepFinding[]>;
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  go: '.go',
  java: '.java',
  ruby: '.rb',
  rust: '.rs',
  php: '.php',
  csharp: '.cs'
};

class SemgrepCli implements Semgrep {
  async analyze(content: string, language?: string, config?: SemgrepConfig): Promise<SemgrepFinding[]> {
    const ext = (language && LANGUAGE_EXTENSIONS[language]) || '.txt';
    const dir = await mkdtemp(path.join(tmpdir(), 'semgrep-'));
    const target = path.join(dir, `snippet${ext}`);

    try {
      await writeFile(target, content, 'utf-8');

      const args = [
        '--json',
        '--quiet',
        '--config',
        config?.rulesPath || 'auto',
        target
      ];

      const { stdout } = await execFileAsync('semgrep', args, {
        maxBuffer: 16 * 1024 * 1024,
        timeout: 120_000
      });

      return this.parseOutput(stdout, config);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          'semgrep CLI not found on PATH. Install semgrep (https://semgrep.dev/docs/getting-started/) ' +
          'or leave enableSemgrep off.'
        );
      }
      // semgrep exits non-zero for scan errors; stdout may still contain JSON findings.
      if (typeof error?.stdout === 'string' && error.stdout.trim().startsWith('{')) {
        return this.parseOutput(error.stdout, config);
      }
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private parseOutput(stdout: string, config?: SemgrepConfig): SemgrepFinding[] {
    const parsed = JSON.parse(stdout) as {
      results?: Array<{
        check_id?: string;
        path?: string;
        start?: { line?: number; col?: number };
        end?: { line?: number; col?: number };
        extra?: { message?: string; severity?: string; lines?: string };
      }>;
    };

    const findings = (parsed.results ?? []).map((r): SemgrepFinding => {
      const severity = (r.extra?.severity?.toUpperCase() ?? 'INFO') as SemgrepFinding['severity'];
      return {
        ruleId: r.check_id ?? 'semgrep.unknown-rule',
        message: r.extra?.message ?? 'Semgrep finding',
        severity: ['ERROR', 'WARNING', 'INFO'].includes(severity) ? severity : 'INFO',
        file: r.path ?? 'unknown',
        line: r.start?.line ?? 1,
        column: r.start?.col ?? 1,
        ...(r.end?.line !== undefined ? { endLine: r.end.line } : {}),
        ...(r.end?.col !== undefined ? { endColumn: r.end.col } : {}),
        ...(r.extra?.lines !== undefined ? { codeSnippet: r.extra.lines } : {})
      };
    });

    return this.applyFilters(findings, config);
  }

  private applyFilters(findings: SemgrepFinding[], config?: SemgrepConfig): SemgrepFinding[] {
    let result = findings;
    if (config?.includeRules?.length) {
      result = result.filter(f => config.includeRules!.some(rule => f.ruleId.includes(rule)));
    }
    if (config?.excludeRules?.length) {
      result = result.filter(f => !config.excludeRules!.some(rule => f.ruleId.includes(rule)));
    }
    if (config?.severityLevels?.length) {
      result = result.filter(f => config.severityLevels!.includes(f.severity));
    }
    return result;
  }
}

class MockSemgrep implements Semgrep {
  async analyze(): Promise<SemgrepFinding[]> {
    return [];
  }
}

export function createSemgrep(): Semgrep {
  return new SemgrepCli();
}

export function createMockSemgrep(): Semgrep {
  return new MockSemgrep();
}
