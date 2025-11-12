import React from 'react';
import { X, Folder, Code, Eye, TerminalSquare, MessageSquare } from 'lucide-react';
import { IDockviewPanelHeaderProps } from 'dockview-core';

type IconConfig = {
  icon: React.ReactNode;
  label: string;
  hideClose?: boolean;
};

const CORE_PANEL_ICONS: Record<string, IconConfig> = {
  explorer: {
    icon: <Folder className="w-3.5 h-3.5" />,
    label: 'Explorer',
    hideClose: true,
  },
  editor: {
    icon: <Code className="w-3.5 h-3.5" />,
    label: 'Editor',
    hideClose: true,
  },
  preview: {
    icon: <Eye className="w-3.5 h-3.5" />,
    label: 'Preview',
    hideClose: true,
  },
  terminal: {
    icon: <TerminalSquare className="w-3.5 h-3.5" />,
    label: 'Terminal',
    hideClose: true,
  },
  chat: {
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    label: 'AI Assistant',
    hideClose: true,
  },
};

function useTitle(api: IDockviewPanelHeaderProps['api']) {
  const [title, setTitle] = React.useState(api.title);

  React.useEffect(() => {
    const disposable = api.onDidTitleChange((event) => {
      setTitle(event.title);
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  return title;
}

export const GooseDockTab: React.FC<IDockviewPanelHeaderProps> = (props) => {
  const { api, ...rest } = props;
  const title = useTitle(api);
  const normalizedId = api.id.split('-')[0];
  const iconConfig = CORE_PANEL_ICONS[normalizedId];
  const hideClose = iconConfig?.hideClose ?? false;

  const isMiddleMouseButton = React.useRef(false);

  const handleClose = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      api.close();
    },
    [api]
  );

  const handlePointerDown = React.useCallback((event: React.PointerEvent) => {
    isMiddleMouseButton.current = event.button === 1;
  }, []);

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent) => {
      if (isMiddleMouseButton.current && event.button === 1 && !hideClose) {
        isMiddleMouseButton.current = false;
        handleClose(event as unknown as React.MouseEvent);
      }
    },
    [hideClose, handleClose]
  );

  const handlePointerLeave = React.useCallback((_event: React.PointerEvent) => {
    isMiddleMouseButton.current = false;
  }, []);

  const renderContent = () => {
    if (iconConfig) {
      return (
        <>
          <span className="sr-only">{iconConfig.label}</span>
          {iconConfig.icon}
        </>
      );
    }

    return <span className="truncate max-w-[160px]">{title}</span>;
  };

  return (
    <div
      data-testid="goose-dock-tab"
      className="dv-default-tab goose-tab"
      {...rest}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      title={iconConfig?.label ?? title}
    >
      <div className="goose-tab-content" aria-hidden={!iconConfig}>
        {renderContent()}
      </div>
      {!hideClose && (
        <button
          type="button"
          className="goose-tab-close"
          onClick={handleClose}
          onPointerDown={(event) => event.preventDefault()}
          aria-label={`Close ${title}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

GooseDockTab.displayName = 'GooseDockTab';
