export interface FileEntry {
  id: string;
  name: string;
  size: number;
  content: string;
  type: string;
}

export interface BundleStats {
  totalSize: number;
  fileCount: number;
  linesOfCode: number;
}

export interface Diagnostic {
  id: string;
  type: 'info' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  VISUALIZER = 'VISUALIZER',
  AI_INSIGHTS = 'AI_INSIGHTS',
  PREVIEW = 'PREVIEW'
}

export interface LintIssue {
  line?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}
