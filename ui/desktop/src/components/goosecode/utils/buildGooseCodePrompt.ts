import type { GooseCodeState } from '../GooseCodeContext';

export function buildGooseCodePrompt(state: GooseCodeState): string {
  const openFiles = state.tabs.map((tab) => `- ${tab.name}`).join('\n') || '  (none)';
  const summary = [
    `You are embedded inside GooseCode, a lightweight web-based IDE.`,
    `Workspace: ${state.workingDir || 'unknown'}`,
    '',
    `Open files:\n${openFiles}`,
    '',
    `Active tab: ${state.activeTab || '(none)'}`,
    `Terminal lines: ${state.terminalOutput.length}`,
  ];

  return summary.join('\n');
}
