import React, { useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Button } from '../../ui/button';

interface TerminalPanelProps {
  output: string[];
  onCommand: (command: string) => void;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ output, onCommand }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onCommand(trimmed);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-full bg-black font-mono text-[12px] text-green-300">
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {output.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap leading-relaxed">
            {line}
          </div>
        ))}
      </div>
      <form
        onSubmit={handleSubmit}
        className="border-t border-[#181818] px-3 py-2 flex items-center gap-2"
      >
        <span className="text-blue-400">$</span>
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          className="flex-1 bg-transparent text-green-200 outline-none border-none"
          placeholder="Type a command…"
          autoComplete="off"
        />
        <Button variant="ghost" size="xs" shape="round" type="submit" title="Run command">
          <SendHorizontal className="w-3.5 h-3.5" />
        </Button>
      </form>
    </div>
  );
};
