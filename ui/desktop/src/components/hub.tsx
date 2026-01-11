/**
 * Hub Component
 *
 * The Hub is the main landing page and entry point for the Goose Desktop application.
 * It serves as the welcome screen where users can start new conversations.
 *
 * Key Responsibilities:
 * - Displays SessionInsights to show session statistics and recent chats
 * - Provides a ChatInput for users to start new conversations
 * - Navigates to Pair with the submitted message to start a new conversation
 * - Ensures each submission from Hub always starts a fresh conversation
 *
 * Navigation Flow:
 * Hub (input submission) → Pair (new conversation with the submitted message)
 */

import { SessionInsights } from './sessions/SessionsInsights';
import ChatInput from './ChatInput';
import { ChatState } from '../types/chatState';
import { ContextManagerProvider } from './context_management/ContextManager';
import { Goose } from './icons/Goose';
import { Greeting } from './common/Greeting';
import React, { useEffect, useRef } from 'react';
import 'react-toastify/dist/ReactToastify.css';
import { View, ViewOptions } from '../utils/navigationUtils';
import { useLocation } from 'react-router-dom';
import MatrixChat from './MatrixChat';
import { useMatrix } from '../contexts/MatrixContext';

// Animated Node Matrix Background Component
const NodeMatrixBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Node configuration
    const nodes: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
    }> = [];

    const nodeCount = 50;
    const maxDistance = 150;
    const nodeSpeed = 0.3;

    // Initialize nodes
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * nodeSpeed,
        vy: (Math.random() - 0.5) * nodeSpeed,
        size: Math.random() * 2 + 1,
      });
    }

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw nodes
      nodes.forEach((node, i) => {
        // Update position
        node.x += node.vx;
        node.y += node.vy;

        // Bounce off edges
        if (node.x <= 0 || node.x >= canvas.width) node.vx *= -1;
        if (node.y <= 0 || node.y >= canvas.height) node.vy *= -1;

        // Keep nodes in bounds
        node.x = Math.max(0, Math.min(canvas.width, node.x));
        node.y = Math.max(0, Math.min(canvas.height, node.y));

        // Draw node
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        // Use CSS variable for background color with 80% opacity
        const bgColor = getComputedStyle(canvas).getPropertyValue('--background-default').trim() || '#ffffff';
        ctx.fillStyle = bgColor.startsWith('#') 
          ? `${bgColor}CC` // Add 80% opacity (CC in hex)
          : bgColor.replace('rgb', 'rgba').replace(')', ', 0.8)');
        ctx.fill();

        // Draw connections
        for (let j = i + 1; j < nodes.length; j++) {
          const otherNode = nodes[j];
          const distance = Math.sqrt(
            Math.pow(node.x - otherNode.x, 2) + Math.pow(node.y - otherNode.y, 2)
          );

          if (distance < maxDistance) {
            const opacity = (1 - distance / maxDistance) * 0.2;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(otherNode.x, otherNode.y);
            // Use the same background color for connections
            ctx.strokeStyle = bgColor.startsWith('#')
              ? `${bgColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`
              : bgColor.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
};

export default function Hub({
  setView,
  setIsGoosehintsModalOpen,
  isExtensionsLoading,
  resetChat,
}: {
  setView: (view: View, viewOptions?: ViewOptions) => void;
  setIsGoosehintsModalOpen: (isOpen: boolean) => void;
  isExtensionsLoading: boolean;
  resetChat: () => void;
}) {
  const location = useLocation();
  const { isConnected, friends } = useMatrix();
  const [backgroundImage, setBackgroundImage] = React.useState<string | null>(null);
  const [showText, setShowText] = React.useState(true);
  const [homeOverlayOpacity, setHomeOverlayOpacity] = React.useState(0);

  // Load background image from localStorage
  useEffect(() => {
    const HOME_BG_VERSION_KEY = 'home_background_image_version';
    const HOME_BG_MODE_KEY = 'home_background_mode'; // 'disk' | 'url'
    const HOME_BG_URL_KEY = 'home_background_url';

    const loadBackgroundImage = async () => {
      // Home-only URL background
      const mode = localStorage.getItem(HOME_BG_MODE_KEY);
      const url = localStorage.getItem(HOME_BG_URL_KEY);
      if (mode === 'url' && url) {
        setBackgroundImage(url);
        return;
      }

      // Prefer disk-backed image (reliable across restarts + avoids localStorage quota)
      const disk = await window.electron.getHomeBackgroundImage();
      if (disk) {
        setBackgroundImage(disk);
        return;
      }

      // Legacy fallback
      const legacy = localStorage.getItem('home_background_image');
      if (legacy) {
        setBackgroundImage(legacy);
        // Best-effort migration to disk
        const res = await window.electron.saveHomeBackgroundImage(legacy);
        if (res?.success) {
          localStorage.removeItem('home_background_image');
          localStorage.setItem(HOME_BG_MODE_KEY, 'disk');
          localStorage.removeItem(HOME_BG_URL_KEY);
          localStorage.setItem(HOME_BG_VERSION_KEY, Date.now().toString());
        }
        return;
      }

      setBackgroundImage(null);
    };

    // Load on mount
    void loadBackgroundImage();

    // Listen for updates from settings (same window)
    const handleBackgroundUpdate = () => {
      void loadBackgroundImage();
    };

    window.addEventListener('background-image-updated', handleBackgroundUpdate);
    
    // Cross-window sync: Preferences/Settings may run in a separate Electron window.
    // storage events fire in *other* windows for the same origin/partition.
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== HOME_BG_VERSION_KEY && e.key !== 'home_background_image') return;
      void loadBackgroundImage();
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('background-image-updated', handleBackgroundUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Home wallpaper presentation:
  // Start with the wallpaper at full color, then fade in a darker translucent overlay
  // to improve foreground contrast without permanently dulling the initial "pop".
  useEffect(() => {
    if (!backgroundImage) {
      setHomeOverlayOpacity(0);
      return;
    }

    setHomeOverlayOpacity(0);
    const t = window.setTimeout(() => {
      setHomeOverlayOpacity(1);
    }, 350);

    return () => window.clearTimeout(t);
  }, [backgroundImage]);

  // Fade out blur when text disappears after 5 seconds
  useEffect(() => {
    const hideTextTimer = setTimeout(() => {
      setShowText(false);
    }, 5000);

    return () => {
      clearTimeout(hideTextTimer);
    };
  }, []);

  // Check if we're in Matrix chat mode
  const routeState = location.state as ViewOptions | undefined;
  const isMatrixMode = routeState?.matrixMode || false;
  const matrixRoomId = routeState?.matrixRoomId;
  const matrixRecipientId = routeState?.matrixRecipientId;
  const useRegularChat = routeState?.useRegularChat || false;

  // Handle chat input submission - create new chat and navigate to pair
  const handleSubmit = (e: React.FormEvent) => {
    const customEvent = e as unknown as CustomEvent;
    const combinedTextFromInput = customEvent.detail?.value || '';

    if (combinedTextFromInput.trim()) {
      // Navigate to pair page with the message to be submitted
      // Pair will handle creating the new chat session
      resetChat();
      setView('pair', {
        disableAnimation: true,
        initialMessage: combinedTextFromInput,
      });
    }

    e.preventDefault();
  };

  // Handle closing Matrix chat and returning to normal Hub
  const handleCloseMatrixChat = () => {
    setView('chat', { resetChat: true });
  };

  // If we're in Matrix mode and have the required parameters
  if (isMatrixMode && matrixRoomId && isConnected) {
    // If useRegularChat is true, show a regular chat interface with Matrix integration
    if (useRegularChat) {
      console.log('🔄 Showing regular chat interface with Matrix integration');
      return (
        <ContextManagerProvider>
          <div className="relative flex flex-col h-full">
            {/* Header with back button and room info */}
            <div className="flex items-center gap-3 p-4 border-b border-border-default bg-background-muted">
              <button
                onClick={handleCloseMatrixChat}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:text-text-default hover:bg-background-subtle rounded-lg transition-colors"
              >
                ← Back to Chat
              </button>
              <div className="flex-1">
                <h2 className="text-lg font-medium text-text-default">
                  Matrix Collaboration
                </h2>
                <p className="text-sm text-text-muted">
                  Room: {matrixRoomId} • Collaborating with {matrixRecipientId?.split(':')[0]?.substring(1) || 'Unknown'}
                </p>
              </div>
            </div>
            
            {/* Chat area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 p-6">
                <div className="text-center text-text-muted">
                  <p className="mb-4">🤝 You're now in a collaborative Matrix chat!</p>
                  <p className="text-sm">
                    Messages you send here will be shared with other participants in the Matrix room.
                    You can chat with both Goose and other collaborators.
                  </p>
                </div>
              </div>
              
              {/* Chat input at bottom */}
              <div className="p-4 border-t border-border-default">
                <ChatInput
                  sessionId={null}
                  handleSubmit={(e: React.FormEvent) => {
                    const customEvent = e as unknown as CustomEvent;
                    const message = customEvent.detail?.value || '';
                    console.log('📤 Sending Matrix message:', message);
                    // TODO: Integrate with Matrix sending logic
                    e.preventDefault();
                  }}
                  autoSubmit={false}
                  chatState={ChatState.Idle}
                  onStop={() => {}}
                  commandHistory={[]}
                  initialValue=""
                  setView={setView}
                  numTokens={0}
                  inputTokens={0}
                  outputTokens={0}
                  droppedFiles={[]}
                  onFilesProcessed={() => {}}
                  messages={[]}
                  setMessages={() => {}}
                  disableAnimation={false}
                  sessionCosts={undefined}
                  setIsGoosehintsModalOpen={setIsGoosehintsModalOpen}
                  isExtensionsLoading={isExtensionsLoading}
                  toolCount={0}
                />
              </div>
            </div>
          </div>
        </ContextManagerProvider>
      );
    }
    
    // Otherwise, render the Matrix chat popup (original behavior)
    return (
      <ContextManagerProvider>
        <div className="relative flex flex-col h-full">
          <MatrixChat
            roomId={matrixRoomId}
            recipientId={matrixRecipientId}
            onBack={handleCloseMatrixChat}
            className="h-full"
          />
        </div>
      </ContextManagerProvider>
    );
  }

  return (
    <ContextManagerProvider>
      <div className="relative flex flex-col h-full rounded-t-2xl overflow-hidden">
        {/* Background Image - Behind everything */}
        {backgroundImage && (
          <>
            <div 
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ 
                // Quote to safely handle data URLs and special characters.
                backgroundImage: `url("${backgroundImage}")`,
                zIndex: 0
              }}
            />
            {/* Dark overlay (fades in after initial full-color reveal) */}
            <div
              className="absolute inset-0 transition-opacity duration-700 ease-out"
              style={{
                zIndex: 1,
                // Darken significantly, but keep wallpaper visible.
                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                opacity: homeOverlayOpacity,
              }}
            />
          </>
        )}
        
        {/* Center Chat Input - Main focal point */}
        <div className="relative flex-1 flex items-center justify-center p-8" style={{ zIndex: 10 }}>
          <div className="w-full max-w-4xl flex flex-col items-center">
            {/* Greeting above the input */}
            <div className={`text-center transition-all duration-1000 ${showText ? 'mb-8' : 'mb-4'}`}>
              <div className="origin-center mb-6 goose-icon-animation">
                <Goose className="size-12 mx-auto" />
              </div>
              <div 
                className="transition-all duration-1000 overflow-hidden"
                style={{ 
                  opacity: showText ? 1 : 0,
                  maxHeight: showText ? '200px' : '0px',
                  marginBottom: showText ? '0px' : '0px'
                }}
              >
                <Greeting className="text-4xl font-light text-text-default mb-4" />
                <p className="text-text-default text-lg">
                  Start a new conversation to get help with your projects
                </p>
              </div>
            </div>

            {/* Chat Input */}
            <div className="w-full [&>div]:!rounded-2xl">
              <ChatInput
                sessionId={null}
                handleSubmit={handleSubmit}
                autoSubmit={false}
                chatState={ChatState.Idle}
                onStop={() => {}}
                commandHistory={[]}
                initialValue=""
                setView={setView}
                numTokens={0}
                inputTokens={0}
                outputTokens={0}
                droppedFiles={[]}
                onFilesProcessed={() => {}}
                messages={[]}
                setMessages={() => {}}
                // Keep the composer out of opacity animations; this improves backdrop blur stability
                // in Electron/Chromium during resize.
                disableAnimation={true}
                sessionCosts={undefined}
                setIsGoosehintsModalOpen={setIsGoosehintsModalOpen}
                isExtensionsLoading={isExtensionsLoading}
                toolCount={0}
              />
            </div>
          </div>
        </div>
      </div>
    </ContextManagerProvider>
  );
}
