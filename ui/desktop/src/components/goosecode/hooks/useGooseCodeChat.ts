import { useCallback, useMemo, useState } from 'react';
import type { GooseCodeState } from '../GooseCodeContext';
import type { GooseCodeToolHandlers } from '../tools/gooseCodeTools';
import type { ChatMessage } from '../panels/ChatPanel';

type ChatState = 'idle' | 'thinking' | 'streaming';

type UseGooseCodeChatOptions = {
  sessionId: string;
  workingDir: string;
  ideState: GooseCodeState;
  toolHandlers: GooseCodeToolHandlers;
};

type UseGooseCodeChatResult = {
  chatMessages: ChatMessage[];
  sendMessage: (message: string) => Promise<void>;
  stopGoose: () => void;
  chatState: ChatState;
  error: Error | null;
  isStreaming: boolean;
};

const THINK_DELAY = 400;
const RESPONSE_DELAY = 600;

export function useGooseCodeChat({ ideState }: UseGooseCodeChatOptions): UseGooseCodeChatResult {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [pendingTimeout, setPendingTimeout] = useState<number | null>(null);

  const isStreaming = chatState === 'streaming';

  const stopGoose = useCallback(() => {
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      setPendingTimeout(null);
    }
    setChatState('idle');
  }, [pendingTimeout]);

  const sendMessage = useCallback(
    async (message: string) => {
      try {
        setError(null);
        setChatMessages((prev) => [...prev, { role: 'user', content: message }]);
        setChatState('thinking');

        const thinkTimeout = window.setTimeout(() => {
          setChatState('streaming');

          const responseTimeout = window.setTimeout(() => {
            const summary = ideState.tabs.length
              ? ideState.tabs.map((tab) => `- ${tab.name}`).join('\n')
              : 'No files open yet.';

            setChatMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `*(Placeholder response)*\n\nTabs available:\n${summary}`,
              },
            ]);
            setChatState('idle');
            setPendingTimeout(null);
          }, RESPONSE_DELAY);

          setPendingTimeout(responseTimeout);
        }, THINK_DELAY);

        setPendingTimeout(thinkTimeout);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unexpected chat error'));
        setChatState('idle');
      }
    },
    [ideState.tabs]
  );

  return useMemo(
    () => ({
      chatMessages,
      sendMessage,
      stopGoose,
      chatState,
      error,
      isStreaming,
    }),
    [chatMessages, sendMessage, stopGoose, chatState, error, isStreaming]
  );
}
