import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, History, FileText, Clock, Puzzle, Settings as SettingsIcon, GripVertical, Users, Hash, ShoppingBag, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatSmart } from '../icons';
import { listSessions, getSessionInsights } from '../../api';
import { useConfig } from '../ConfigContext';
import { listSavedRecipes } from '../../recipe/recipe_management';
import { useNavigationCustomization } from '../settings/app/NavigationCustomizationSettings';
import { createNavigationHandler } from '../../utils/navigationUtils';

interface NavItem {
  id: string;
  path?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  getTag?: () => string;
  tagAlign?: 'left' | 'right';
  isWidget?: boolean;
  renderContent?: () => React.ReactNode;
}

export type NavigationPosition = 'top' | 'bottom' | 'left' | 'right';

interface CondensedNavigationProps {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  position?: NavigationPosition;
  isOverlayMode?: boolean;
}

export const CondensedNavigation: React.FC<CondensedNavigationProps> = ({ 
  isExpanded, 
  setIsExpanded, 
  position = 'top',
  isOverlayMode = false
}) => {
  const navigate = useNavigate();
  const setView = React.useMemo(() => createNavigationHandler(navigate), [navigate]);
  const location = useLocation();
  const { extensionsList, getExtensions } = useConfig();
  const { preferences } = useNavigationCustomization();
  const [forceUpdate, setForceUpdate] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const [todayChatsCount, setTodayChatsCount] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [recipesCount, setRecipesCount] = useState(0);
  const [scheduledTodayCount, setScheduledTodayCount] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);

  // Handle escape key to close overlay
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isExpanded && isOverlayMode) {
        event.preventDefault();
        event.stopPropagation();
        setIsExpanded(false);
      }
    };

    if (isOverlayMode && isExpanded) {
      document.addEventListener('keydown', handleKeyDown, { capture: true });
      return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
    }
  }, [isExpanded, isOverlayMode, setIsExpanded]);

  const [sessionHeatmapData, setSessionHeatmapData] = useState<Record<string, number>>({});
  
  // Track previous values for pulse animation
  const [prevValues, setPrevValues] = useState<Record<string, string>>({});
  const [pulsingItems, setPulsingItems] = useState<Set<string>>(new Set());
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [itemOrder, setItemOrder] = useState<string[]>([]);

  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch data when navigation expands
  useEffect(() => {
    if (isExpanded) {
      fetchNavigationData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  const fetchNavigationData = async () => {
    try {
      // Fetch today's chats and build heatmap
      const sessionsResponse = await listSessions({ throwOnError: false });
      if (sessionsResponse.data) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Build heatmap data for last 30 days and count today's chats in one pass
        const heatmap: Record<string, number> = {};
        let todayCount = 0;
        
        sessionsResponse.data.sessions.forEach((session) => {
          const sessionDate = new Date(session.created_at);
          const dateKey = sessionDate.toISOString().split('T')[0];
          heatmap[dateKey] = (heatmap[dateKey] || 0) + 1;
          
          // Count today's chats
          const sessionDateOnly = new Date(session.created_at);
          sessionDateOnly.setHours(0, 0, 0, 0);
          if (sessionDateOnly.getTime() === today.getTime()) {
            todayCount++;
          }
        });
        
        setSessionHeatmapData(heatmap);
        setTodayChatsCount(todayCount);
      }

      // Fetch total sessions and tokens
      const insightsResponse = await getSessionInsights({ throwOnError: false });
      if (insightsResponse.data) {
        setTotalSessions(insightsResponse.data.totalSessions || 0);
        setTotalTokens(insightsResponse.data.totalTokens || 0);
      }

      // Fetch recipes count
      try {
        const recipes = await listSavedRecipes();
        setRecipesCount(recipes.length);
      } catch (error) {
        console.error('Failed to fetch recipes:', error);
        setRecipesCount(0);
      }

      // TODO: Fetch scheduled jobs when API is available
      setScheduledTodayCount(0);

      // Refresh extensions data
      try {
        await getExtensions(true);
      } catch (error) {
        console.error('Failed to fetch extensions:', error);
      }
    } catch (error) {
      console.error('Failed to fetch navigation data:', error);
    }
  };

  // Analog Clock Widget Component
  const AnalogClock: React.FC = () => {
    const [secondAngle, setSecondAngle] = useState(() => {
      const now = new Date();
      return now.getSeconds() * 6;
    });
    const [angles, setAngles] = useState(() => {
      const now = new Date();
      const hours = now.getHours() % 12;
      const minutes = now.getMinutes();
      return {
        hour: (hours * 30) + (minutes * 0.5),
        minute: minutes * 6,
      };
    });

    useEffect(() => {
      const interval = setInterval(() => {
        const now = new Date();
        const hours = now.getHours() % 12;
        const minutes = now.getMinutes();
        
        // Increment second angle by 6 degrees each second
        setSecondAngle(prev => prev + 6);
        
        setAngles({
          hour: (hours * 30) + (minutes * 0.5),
          minute: minutes * 6,
        });
      }, 1000);
      return () => clearInterval(interval);
    }, []);

    const hourAngle = angles.hour;
    const minuteAngle = angles.minute;

    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="relative w-12 h-12">
          {/* Clock face */}
          <div className="absolute inset-0 rounded-full border-2 border-text-muted/20" />
          
          {/* Hour markers */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-1 bg-text-muted/40 top-1 left-1/2 -translate-x-1/2"
              style={{
                transformOrigin: '50% 22px',
                transform: `translateX(-50%) rotate(${i * 30}deg)`,
              }}
            />
          ))}
          
          {/* Hour hand */}
          <div
            className="absolute w-0.5 h-4 bg-text-default rounded-full top-1/2 left-1/2 -translate-x-1/2 origin-bottom transition-transform duration-1000 ease-linear"
            style={{
              transform: `translateX(-50%) translateY(-100%) rotate(${hourAngle}deg)`,
            }}
          />
          
          {/* Minute hand */}
          <div
            className="absolute w-px h-5 bg-text-default rounded-full top-1/2 left-1/2 -translate-x-1/2 origin-bottom transition-transform duration-1000 ease-linear"
            style={{
              transform: `translateX(-50%) translateY(-100%) rotate(${minuteAngle}deg)`,
            }}
          />
          
          {/* Second hand */}
          <div
            className="absolute w-px h-6 bg-red-500 rounded-full top-1/2 left-1/2 -translate-x-1/2 origin-bottom transition-transform duration-1000 ease-linear"
            style={{
              transform: `translateX(-50%) translateY(-100%) rotate(${secondAngle}deg)`,
            }}
          />
          
          {/* Center dot */}
          <div className="absolute w-1 h-1 bg-text-default rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
    );
  };

  const navItemsBase: NavItem[] = [
    {
      id: 'home',
      path: '/',
      label: 'Home',
      icon: Home,
      getTag: () => currentTime,
    },
    {
      id: 'chat',
      path: '/pair',
      label: 'Chat',
      icon: ChatSmart,
      getTag: () => `${todayChatsCount}`,
      tagAlign: 'left',
    },
    {
      id: 'agent-studio',
      path: '/agent-studio',
      label: 'Agent Studio',
      icon: Bot,
      getTag: () => 'AI',
      tagAlign: 'left',
    },
    {
      id: 'team',
      path: '/team',
      label: 'Team',
      icon: Users,
      getTag: () => 'team',
      tagAlign: 'left',
    },
    {
      id: 'settings',
      path: '/settings',
      label: 'Customize',
      icon: SettingsIcon,
    },
    // Widget tiles for overlay mode
    {
      id: 'clock-widget',
      label: 'Clock',
      isWidget: true,
      renderContent: () => <AnalogClock />,
    },
    {
      id: 'activity-widget',
      label: 'Activity',
      isWidget: true,
      renderContent: () => {
        // Get last 35 days for a 5x7 grid
        const days = 35;
        const today = new Date();
        const heatmapCells = [];
        
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateKey = date.toISOString().split('T')[0];
          const count = sessionHeatmapData[dateKey] || 0;
          
          // Calculate intensity (0-4 scale)
          const maxCount = Math.max(...Object.values(sessionHeatmapData), 1);
          const intensity = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);
          
          heatmapCells.push({ date: dateKey, count, intensity });
        }
        
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-2">
            <div className="grid grid-cols-7 gap-0.5">
              {heatmapCells.map((cell, index) => (
                <div
                  key={index}
                  className={`w-1.5 h-1.5 rounded-sm ${
                    cell.intensity === 0 ? 'bg-background-muted' :
                    cell.intensity === 1 ? 'bg-green-200 dark:bg-green-900' :
                    cell.intensity === 2 ? 'bg-green-300 dark:bg-green-700' :
                    cell.intensity === 3 ? 'bg-green-400 dark:bg-green-600' :
                    'bg-green-500 dark:bg-green-500'
                  }`}
                  title={`${cell.date}: ${cell.count} sessions`}
                />
              ))}
            </div>
            <div className="mt-1 text-xs text-text-muted font-mono">
              Last 35 days
            </div>
          </div>
        );
      },
    },
    {
      id: 'tokens-widget',
      label: 'Tokens',
      isWidget: true,
      renderContent: () => {
        // Format tokens in millions
        const tokensInMillions = (totalTokens / 1000000).toFixed(2);
        
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-2">
            <div className="text-center">
              <div className="text-lg font-mono font-light text-text-default mb-1">
                {tokensInMillions}M
              </div>
              <div className="text-xs text-text-muted font-mono">
                Total tokens
              </div>
            </div>
          </div>
        );
      },
    },
  ];

  // Filter and order navigation items based on user preferences
  const navItems = React.useMemo(() => {
    console.log('CondensedNavigation: Recomputing navItems with preferences:', preferences);
    
    // Filter enabled items
    const enabledItems = navItemsBase.filter(item => 
      preferences.enabledItems.includes(item.id)
    );

    // Push + Left/Right should be a clean menu (no widgets)
    const isVertical = position === 'left' || position === 'right';
    const filteredItems =
      !isOverlayMode && isVertical ? enabledItems.filter((item) => !item.isWidget) : enabledItems;

    // Order items according to user preferences
    const orderedItems = preferences.itemOrder
      .map(id => filteredItems.find(item => item.id === id))
      .filter(Boolean) as NavItem[];

    // Add any new items that aren't in the order yet (for backwards compatibility)
    const itemsNotInOrder = filteredItems.filter(item => 
      !preferences.itemOrder.includes(item.id)
    );

    const result = [...orderedItems, ...itemsNotInOrder];
    console.log('CondensedNavigation: Computed navItems:', result.map(item => item.id));
    return result;
  }, [navItemsBase, preferences.enabledItems, preferences.itemOrder, forceUpdate, isOverlayMode, position, currentTime, todayChatsCount, totalSessions, recipesCount, totalTokens]);

  // Listen for navigation preferences updates
  useEffect(() => {
    const handlePreferencesUpdate = (event: CustomEvent) => {
      console.log('CondensedNavigation: Navigation preferences updated:', event.detail);
      // Force re-render when preferences change by updating multiple states
      setForceUpdate(prev => prev + 1);
      setItemOrder(prev => [...prev]);
    };

    window.addEventListener('navigation-preferences-updated', handlePreferencesUpdate as EventListener);
    return () => {
      window.removeEventListener('navigation-preferences-updated', handlePreferencesUpdate as EventListener);
    };
  }, []);

  // Track value changes for pulse animation
  useEffect(() => {
    const currentValues: Record<string, string> = {
      chat: `${todayChatsCount}`,
      history: `${totalSessions}`,
      recipes: `${recipesCount}`,
      scheduler: `${scheduledTodayCount}`,
      tokens: `${totalTokens}`,
    };

    Object.entries(currentValues).forEach(([key, value]) => {
      if (prevValues[key] && prevValues[key] !== value) {
        setPulsingItems(prev => new Set(prev).add(key));
        setTimeout(() => {
          setPulsingItems(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }, 2000);
      }
    });

    setPrevValues(currentValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayChatsCount, totalSessions, recipesCount, scheduledTodayCount, totalTokens]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedItem && draggedItem !== itemId) {
      setDragOverItem(itemId);
    }
  };

  const handleDrop = (e: React.DragEvent, dropItemId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === dropItemId) return;

    const newOrder = [...itemOrder];
    const draggedIndex = newOrder.indexOf(draggedItem);
    const dropIndex = newOrder.indexOf(dropItemId);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);

    setItemOrder(newOrder);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Determine layout based on position
  const isVertical = position === 'left' || position === 'right';

  return (
    <div className={`${(isOverlayMode || isVertical) ? 'bg-transparent' : 'bg-background-muted'} relative z-[9998] ${isVertical ? 'h-full' : 'w-full'}`}>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={isOverlayMode ? { 
              x: -240, 
              opacity: 0 
            } : { 
              [isVertical ? 'width' : 'height']: 0, 
              opacity: 0 
            }}
            animate={isOverlayMode ? { 
              x: 0, 
              opacity: 1,
            } : { 
              [isVertical ? 'width' : 'height']: "auto", 
              opacity: 1,
            }}
            exit={isOverlayMode ? { 
              x: -240, 
              opacity: 0,
            } : { 
              [isVertical ? 'width' : 'height']: 0, 
              opacity: 0,
            }}
            transition={isOverlayMode ? {
              type: "spring",
              stiffness: 300,
              damping: 30,
              mass: 0.8,
            } : {
              [isVertical ? 'width' : 'height']: {
                type: "spring",
                stiffness: 300,
                damping: 30,
                mass: 0.8,
              },
              opacity: {
                duration: 0.3,
                ease: "easeInOut"
              }
            }}
            className={`${isOverlayMode ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] shadow-2xl' : (isVertical ? 'bg-transparent overflow-hidden' : 'bg-background-muted overflow-hidden')} ${
              !isOverlayMode && isVertical ? 'h-full lg:relative lg:z-auto absolute z-[10000] top-0 shadow-lg lg:shadow-none' : ''
            } ${
              !isOverlayMode && isVertical && position === 'left' ? 'left-0' : ''
            } ${
              !isOverlayMode && isVertical && position === 'right' ? 'right-0' : ''
            }`}
          >
            <motion.div
              initial={isOverlayMode ? { opacity: 0 } : { [isVertical ? 'x' : 'y']: -20 }}
              animate={isOverlayMode ? { opacity: 1 } : { [isVertical ? 'x' : 'y']: 0 }}
              exit={isOverlayMode ? { opacity: 0 } : { [isVertical ? 'x' : 'y']: -20 }}
              transition={isOverlayMode ? {
                duration: 0.2,
                delay: 0.1
              } : {
                type: "spring",
                stiffness: 400,
                damping: 25,
              }}
              className={`${isOverlayMode ? 'p-4 bg-transparent rounded-2xl' : ''} ${
                !isOverlayMode && isVertical 
                  ? position === 'right' 
                    ? 'h-full pl-0.5' 
                    : 'h-full pr-0.5'
                  : !isOverlayMode && position === 'top'
                    ? 'pr-0.5 pb-0.5'
                    : !isOverlayMode ? 'pr-0.5' : ''
              }`}
              style={{ width: isVertical && !isOverlayMode ? '240px' : undefined }}
            >
{isOverlayMode ? (
                // Overlay Mode: Small icon-only tiles in a centered grid
                <div className="w-full h-full flex items-center justify-center">
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 p-4 max-w-3xl">
                    {navItems.filter(item => !item.isWidget).map((item, index) => {
                      const isPulsing = pulsingItems.has(item.id);
                      const isDragging = draggedItem === item.id;
                      const isDragOver = dragOverItem === item.id;
                      const IconComponent = item.icon;
                      const active = item.path ? isActive(item.path) : false;

                      return (
                        <motion.div
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, item.id)}
                          onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, item.id)}
                          onDrop={(e) => handleDrop(e as unknown as React.DragEvent, item.id)}
                          onDragEnd={handleDragEnd}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ 
                            opacity: 1, 
                            scale: isDragging ? 0.95 : 1,
                          }}
                          transition={{
                            type: "spring",
                            stiffness: 350,
                            damping: 25,
                            delay: index * 0.02,
                          }}
                          className={`
                            relative cursor-move group
                            ${isDragOver ? 'ring-2 ring-blue-500 rounded-xl' : ''}
                          `}
                          style={{
                            opacity: isDragging ? 0.5 : 1,
                          }}
                        >
                          <motion.button
                            onClick={() => {
                              if (item.path) {
                                if (item.id === 'settings') {
                                  // Always open Customize in a separate Preferences window
                                  if (typeof window?.electron?.createPreferencesWindow === 'function') {
                                    void window.electron.createPreferencesWindow({ section: 'interface' });
                                  }
                                } else {
                                  navigate(item.path);
                                }
                                setIsExpanded(false);
                              }
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`
                              w-14 h-14 flex items-center justify-center
                              relative rounded-xl transition-colors duration-200 no-drag
                              ${active 
                                ? 'bg-background-accent text-text-on-accent backdrop-blur-md' 
                                : 'bg-background-default text-text-default hover:bg-background-medium backdrop-blur-md'
                              }
                            `}
                            title={item.label}
                          >
                            {/* Icon only - no label */}
                            {IconComponent && <IconComponent className="w-6 h-6" />}

                            {/* Update indicator dot */}
                            {isPulsing && (
                              <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                              />
                            )}
                          </motion.button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Push Mode
                isVertical ? (
                  // Left/Right: simplified menu-only list (no drag handles, tags, or spacers)
                  <div className="flex flex-col w-full gap-1 h-full pt-12 px-2 pb-2">
                    {navItems.filter(item => !item.isWidget).map((item, index) => {
                      const IconComponent = item.icon;
                      const active = item.path ? isActive(item.path) : false;

                      return (
                        <motion.button
                          key={item.id}
                          onClick={() => {
                            if (item.path) {
                              if (item.id === 'settings') {
                                // Always open Customize in a separate Preferences window
                                if (typeof window?.electron?.createPreferencesWindow === 'function') {
                                  void window.electron.createPreferencesWindow({ section: 'interface' });
                                }
                              } else {
                                navigate(item.path);
                              }
                              setIsExpanded(false);
                            }
                          }}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 350,
                            damping: 25,
                            delay: index * 0.015,
                          }}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          className={`
                            flex flex-row items-center gap-3 w-full
                            relative rounded-lg transition-colors duration-200 no-drag
                            px-3 py-2.5
                            ${active 
                              ? 'bg-background-accent text-text-on-accent' 
                              : 'text-text-default hover:bg-background-medium'
                            }
                          `}
                        >
                          {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0" />}
                          <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  // Top/Bottom: keep existing behavior (compact row)
                  <div className="flex flex-row w-full gap-[1px]">
                    {/* Top spacer for horizontal layout */}
                    {position === 'top' && (
                      <div className="w-[100px] bg-background-default rounded-lg flex items-center justify-center py-2.5" />
                    )}

                    {navItems.filter(item => !item.isWidget).map((item, index) => {
                      const isPulsing = pulsingItems.has(item.id);
                      const isDragging = draggedItem === item.id;
                      const isDragOver = dragOverItem === item.id;
                      const IconComponent = item.icon;
                      const active = item.path ? isActive(item.path) : false;

                      return (
                        <motion.div
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, item.id)}
                          onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, item.id)}
                          onDrop={(e) => handleDrop(e as unknown as React.DragEvent, item.id)}
                          onDragEnd={handleDragEnd}
                          initial={{ opacity: 0, y: 20, scale: 0.9 }}
                          animate={{ 
                            opacity: 1, 
                            y: 0, 
                            scale: isDragging ? 0.95 : 1,
                          }}
                          transition={{
                            type: "spring",
                            stiffness: 350,
                            damping: 25,
                            delay: index * 0.02,
                          }}
                          className={`
                            relative cursor-move group flex-1
                            ${isDragOver ? 'ring-2 ring-blue-500 rounded-lg' : ''}
                          `}
                          style={{
                            opacity: isDragging ? 0.5 : 1,
                          }}
                        >
                          <motion.button
                            onClick={() => {
                              if (item.path) {
                                if (item.id === 'settings') {
                                  // Always open Customize in a separate Preferences window
                                  if (typeof window?.electron?.createPreferencesWindow === 'function') {
                                    void window.electron.createPreferencesWindow({ section: 'interface' });
                                  }
                                } else {
                                  navigate(item.path);
                                }
                                setIsExpanded(false);
                              }
                            }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`
                              flex flex-row items-center gap-2 w-full
                              relative rounded-lg transition-colors duration-200 no-drag
                              px-2 pt-[18px] pb-[14px] min-[1800px]:pl-2 min-[1800px]:pr-4
                              ${active 
                                ? 'bg-background-accent text-text-on-accent' 
                                : 'bg-background-default hover:bg-background-medium'
                              }
                            `}
                          >
                            {/* Drag handle indicator */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity hidden min-[1800px]:block">
                              <GripVertical className="w-4 h-4 text-text-muted" />
                            </div>

                            {/* Icon */}
                            {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0 mx-auto min-[1800px]:mx-0" />}

                            {/* Label */}
                            <span className="text-sm font-medium flex-1 text-left hidden min-[1800px]:block">{item.label}</span>

                            {/* Tag/Badge */}
                            {item.getTag && (
                              <div className="items-center gap-1 hidden min-[1800px]:flex">
                                <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                                  active 
                                    ? 'bg-background-default/20 text-text-on-accent/80' 
                                    : 'bg-background-muted text-text-muted'
                                }`}>
                                  {item.getTag()}
                                </span>
                              </div>
                            )}

                            {/* Update indicator dot */}
                            {isPulsing && (
                              <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                              />
                            )}
                          </motion.button>
                        </motion.div>
                      );
                    })}

                    {/* Bottom spacer */}
                    {(position === 'top' || position === 'bottom') && (
                      <div className={`${position === 'top' ? 'w-[160px]' : 'flex-1 min-w-[60px]'} bg-background-default rounded-lg flex items-center justify-center py-2.5`} />
                    )}
                  </div>
                )
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
