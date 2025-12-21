import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import ThemeSelector from '../../GooseSidebar/ThemeSelector';
import NavigationPositionSelector from '../app/NavigationPositionSelector';
import NavigationStyleSelector from '../app/NavigationStyleSelector';
import NavigationModeSelector, { useNavigationMode } from '../app/NavigationModeSelector';
import NavigationCustomizationSettings from '../app/NavigationCustomizationSettings';
import BackgroundSection from '../appearance/BackgroundSection';

interface InterfaceSectionProps {
  compactMode?: boolean;
}

export default function InterfaceSection({ compactMode = false }: InterfaceSectionProps) {
  const { mode } = useNavigationMode();

  if (compactMode) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-medium mb-1">Interface</h2>
          <p className="text-sm text-text-muted">
            Customize the look, feel, and navigation of the application
          </p>
        </div>

        {/* Compact List Style */}
        <div className="space-y-1">
          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-0.5">Theme & Appearance</div>
            <div className="text-xs text-text-muted mb-3">Customize the look and feel</div>
            <ThemeSelector />
            <div className="mt-3">
              <BackgroundSection />
            </div>
          </div>

          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-0.5">Navigation & Layout</div>
            <div className="text-xs text-text-muted mb-3">Customize navigation menus</div>
            <div className="space-y-4">
              <NavigationModeSelector />
              {mode === 'push' && (
                <>
                  <div className="h-px bg-border-default" />
                  <NavigationPositionSelector />
                </>
              )}
              <NavigationStyleSelector />
              <NavigationCustomizationSettings />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Theme & Appearance - Visual settings at the top */}
      <Card>
        <CardHeader>
          <CardTitle>Theme & Appearance</CardTitle>
          <CardDescription>
            Customize the look and feel of the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Theme</label>
            <ThemeSelector />
          </div>
          <BackgroundSection />
        </CardContent>
      </Card>

      {/* UI & Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Navigation & Layout</CardTitle>
          <CardDescription>
            Customize how navigation menus appear and behave
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <NavigationModeSelector />

            {/* Only show position controls in Push mode */}
            {mode === 'push' && (
              <>
                <div className="h-px bg-border-default" />
                <NavigationPositionSelector />
              </>
            )}
          </div>

          <NavigationStyleSelector />
          <NavigationCustomizationSettings />
        </CardContent>
      </Card>
    </div>
  );
}

