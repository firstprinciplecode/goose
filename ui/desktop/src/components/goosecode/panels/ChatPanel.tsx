import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Settings, Loader2, Square } from 'lucide-react';
import { Button } from '../../ui/button';
import { useGooseCodeChat } from '../hooks/useGooseCodeChat';
import type { GooseCodeState } from '../GooseCodeContext';
import type { GooseCodeToolHandlers } from '../tools/gooseCodeTools';
import MarkdownContent from '../../MarkdownContent';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  sessionId: string;
  workingDir: string;
  ideState: GooseCodeState;
  toolHandlers: GooseCodeToolHandlers;
  onSettings?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  sessionId,
  workingDir,
  ideState,
  toolHandlers,
  onSettings,
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { chatMessages, sendMessage, stopGoose, chatState, error, isStreaming } = useGooseCodeChat({
    sessionId,
    workingDir,
    ideState,
    toolHandlers,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = async () => {
    if (inputValue.trim() && !isStreaming) {
      await sendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderChatState = () => {
    if (chatState === 'thinking') {
      return (
        <div className="flex items-center gap-2 text-xs text-text-muted py-2 px-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Goose is thinking...</span>
        </div>
      );
    }
    if (chatState === 'streaming') {
      return (
        <div className="flex items-center gap-2 text-xs text-text-muted py-2 px-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Goose is responding...</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="font-medium text-xs">Goose Assistant</span>
          {isStreaming && (
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-text-muted">Active</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isStreaming && (
            <Button variant="ghost" size="xs" onClick={stopGoose} title="Stop Goose">
              <Square className="w-3 h-3" />
            </Button>
          )}
          {onSettings && (
            <Button variant="ghost" size="xs" onClick={onSettings}>
              <Settings className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {chatMessages.map((msg: ChatMessage, index: number) => (
          <div key={index} className="mb-4 w-full">
            <div
              className={`flex flex-col w-full ${
                msg.role === 'user' ? 'user-message' : 'assistant-message'
              }`}
            >
              <MarkdownContent content={msg.content} />
            </div>
          </div>
        ))}

        {renderChatState()}

        {error && (
          <div className="mb-3 text-left">
            <div className="inline-block p-2 rounded-lg text-sm max-w-[85%] bg-red-900/20 text-red-400 border border-red-800">
              <strong>Error:</strong> {error.message}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-border-subtle">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isStreaming}
            className="flex-1 px-3 py-2 text-sm border border-border-subtle rounded bg-background-default disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={isStreaming ? 'Goose is working...' : 'Ask Goose anything...'}
          />
          <Button onClick={handleSend} size="sm" disabled={!inputValue.trim() || isStreaming}>
            {isStreaming ? (
              <>
                <Square className="w-3 h-3 mr-1" />
                Stop
              </>
            ) : (
              'Send'
            )}
          </Button>
        </div>
        <div className="text-xs text-text-muted mt-2">
          Goose can see your files, editor, terminal, and preview
        </div>
      </div>
    </div>
  );
};
