import type { Message } from '../types/message';

export type CollabPromptMode =
  | 'messages'
  | 'messages_human_only'
  | 'collapsed'
  | 'collapsed_human_only'
  | 'collapsed_raw'
  | 'collapsed_human_only_raw';

export type BuildCollabGoosePromptResult = {
  mode: CollabPromptMode;
  messagesForSend: Message[];
  collapsedPromptText?: string;
};

const DEFAULT_MAX_TRANSCRIPT_LINES = 120;
const DEFAULT_MAX_TRANSCRIPT_CHARS = 12000;

function extractText(m: Message): string {
  const content = (m as any)?.content;
  const text =
    Array.isArray(content)
      ? (content as any[])
          .filter((c) => c && c.type === 'text')
          .map((c) => c.text || '')
          .join('')
      : '';
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function buildCollabGoosePrompt(args: {
  /** Whether we have collaborative transcript context (e.g. Supabase) */
  hasSupabaseContext: boolean;
  /** Raw text the user typed (may contain @goose) */
  rawTriggerText: string;
  /** Messages (already prepared for agent consumption) */
  agentMessages: Message[];
  /** Final user message (already created by caller) */
  finalUserMsg: Message;
  /** Prompt mode to use */
  mode: CollabPromptMode;
  /** Optional limits */
  maxTranscriptLines?: number;
  maxTranscriptChars?: number;
}): BuildCollabGoosePromptResult {
  const {
    hasSupabaseContext,
    rawTriggerText,
    agentMessages,
    finalUserMsg,
    mode,
    maxTranscriptLines = DEFAULT_MAX_TRANSCRIPT_LINES,
    maxTranscriptChars = DEFAULT_MAX_TRANSCRIPT_CHARS,
  } = args;

  const isCollabGooseInvoke = hasSupabaseContext && /@goose\b/i.test(rawTriggerText);
  if (!isCollabGooseInvoke) {
    return { mode, messagesForSend: agentMessages };
  }

  const humanOnly = mode.includes('human_only');
  const transcriptMsgs = humanOnly
    ? agentMessages.filter((m) => (m as any)?.role === 'user')
    : agentMessages;

  if (mode.startsWith('messages')) {
    return { mode, messagesForSend: transcriptMsgs };
  }

  // collapsed*
  const rawCollapsed = mode.endsWith('_raw');
  const transcriptLines = transcriptMsgs.map(extractText).filter(Boolean);
  const tailLines =
    transcriptLines.length > maxTranscriptLines
      ? transcriptLines.slice(-maxTranscriptLines)
      : transcriptLines;
  let transcriptText = tailLines.join('\n');
  if (transcriptText.length > maxTranscriptChars) {
    transcriptText = transcriptText.slice(-maxTranscriptChars);
    const nl = transcriptText.indexOf('\n');
    if (nl > 0) transcriptText = transcriptText.slice(nl + 1);
  }

  const collapsedPromptText = rawCollapsed
    ? `${transcriptText}\n\n${rawTriggerText}\n`
    : `Conversation so far (chronological):\n` +
      `${transcriptText}\n\n` +
      `---\n` +
      `@goose was invoked with:\n` +
      `${rawTriggerText}\n\n` +
      `Task: Respond directly to the conversation above. If they are debating a factual question, give the correct answer and briefly explain why.`;

  const collapsedMsg: Message = {
    ...finalUserMsg,
    content: [{ type: 'text', text: collapsedPromptText }],
  };

  return { mode, messagesForSend: [collapsedMsg], collapsedPromptText };
}

