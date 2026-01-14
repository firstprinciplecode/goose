import { describe, expect, it } from 'vitest';
import type { Message } from '../types/message';
import { buildCollabGoosePrompt, type CollabPromptMode } from './collabGoosePrompt';

function msg(role: string, text: string, id: string): Message {
  return {
    id,
    role,
    created: 1,
    content: [{ type: 'text', text }],
  } as unknown as Message;
}

describe('buildCollabGoosePrompt', () => {
  const base: Message[] = [
    msg('user', 'thomas: hi goose', 'u1'),
    msg('assistant', 'hi! what can I help with?', 'a1'),
    msg('user', 'hello@getantelope.com: I think it is Liquid Language Model?', 'u2'),
    msg('user', '@goose can you help here?', 'u3'),
  ];

  const finalUserMsg = msg('user', '@goose can you help here?', 'u-final');

  const run = (mode: CollabPromptMode) =>
    buildCollabGoosePrompt({
      hasSupabaseContext: true,
      rawTriggerText: '@goose can you help here?',
      agentMessages: base,
      finalUserMsg,
      mode,
      maxTranscriptLines: 50,
      maxTranscriptChars: 2000,
    });

  it('messages mode keeps multi-message payload', () => {
    const out = run('messages');
    expect(out.messagesForSend.length).toBe(base.length);
  });

  it('messages_human_only removes assistant messages', () => {
    const out = run('messages_human_only');
    expect(out.messagesForSend.every((m) => (m as any).role === 'user')).toBe(true);
    expect(out.messagesForSend.length).toBe(3);
  });

  it('collapsed returns a single message containing the transcript', () => {
    const out = run('collapsed');
    expect(out.messagesForSend.length).toBe(1);
    const text = (out.messagesForSend[0] as any).content?.[0]?.text as string;
    expect(text).toContain('Conversation so far');
    expect(text).toContain('Liquid Language Model');
    expect(text).toContain('@goose was invoked with');
  });

  it('collapsed_human_only excludes assistant text from transcript', () => {
    const out = run('collapsed_human_only');
    const text = (out.messagesForSend[0] as any).content?.[0]?.text as string;
    expect(text).toContain('Liquid Language Model');
    expect(text).not.toContain('what can I help with?');
  });

  it('collapsed_human_only_raw contains only transcript + trigger (no Task framing)', () => {
    const out = run('collapsed_human_only_raw');
    const text = (out.messagesForSend[0] as any).content?.[0]?.text as string;
    expect(text).toContain('Liquid Language Model');
    expect(text).toContain('@goose can you help here?');
    expect(text).not.toContain('Task: Respond directly');
    expect(text).not.toContain('Conversation so far');
  });
});

