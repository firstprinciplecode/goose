import ModelsSection from '../models/ModelsSection';
import ExtensionsSection from '../extensions/ExtensionsSection';
import ChatSettingsSection from '../chat/ChatSettingsSection';
import { View } from '../../../utils/navigationUtils';

interface SystemSectionProps {
  setView: (view: View) => void;
  compactMode?: boolean;
}

export default function SystemSection({ setView, compactMode = false }: SystemSectionProps) {
  if (compactMode) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-medium mb-1">System</h2>
          <p className="text-sm text-text-muted">
            Configure AI models, extensions, and agent behavior
          </p>
        </div>

        {/* Compact List Style */}
        <div className="space-y-1">
          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-0.5">Models & Providers</div>
            <div className="text-xs text-text-muted mb-3">Configure AI models and providers</div>
            <ModelsSection setView={setView} />
          </div>

          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-0.5">Extensions</div>
            <div className="text-xs text-text-muted mb-3">Manage AI extensions</div>
            <ExtensionsSection />
          </div>

          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-0.5">Agent Settings</div>
            <div className="text-xs text-text-muted mb-3">Mode, response styles, and behavior</div>
            <ChatSettingsSection />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModelsSection setView={setView} />
      <ExtensionsSection />
      <ChatSettingsSection />
    </div>
  );
}

