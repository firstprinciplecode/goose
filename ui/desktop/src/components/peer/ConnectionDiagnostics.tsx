/* eslint-env browser */
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw, Copy, Check } from 'lucide-react';
import { loadSettings, getIceServers } from '../../peer/settings';
import type { PeerNgrokStatus } from '../../preload';

interface ConnectionDiagnosticsProps {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line no-undef
  peerConnection?: RTCPeerConnection | null;
  ngrokStatus?: PeerNgrokStatus;
}

interface DiagnosticResult {
  name: string;
  status: 'success' | 'error' | 'warning' | 'pending';
  message: string;
  details?: string;
}

export const ConnectionDiagnostics: React.FC<ConnectionDiagnosticsProps> = ({
  open,
  onClose,
  peerConnection,
  ngrokStatus,
}) => {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    // Check ICE server configuration
    const settings = loadSettings();
    const iceServers = getIceServers(settings);
    diagnostics.push({
      name: 'ICE Servers',
      status: iceServers.length > 0 ? 'success' : 'warning',
      message: `${iceServers.length} server(s) configured`,
      details: JSON.stringify(iceServers, null, 2),
    });

    // Check peer connection state
    if (peerConnection) {
      const state = peerConnection.connectionState;
      diagnostics.push({
        name: 'Connection State',
        status:
          state === 'connected'
            ? 'success'
            : state === 'failed' || state === 'closed'
              ? 'error'
              : 'warning',
        message: state,
      });

      // Check ICE connection state
      const iceState = peerConnection.iceConnectionState;
      diagnostics.push({
        name: 'ICE Connection',
        status:
          iceState === 'connected' || iceState === 'completed'
            ? 'success'
            : iceState === 'failed' || iceState === 'closed'
              ? 'error'
              : 'warning',
        message: iceState,
      });

      // Check signaling state
      const signalingState = peerConnection.signalingState;
      diagnostics.push({
        name: 'Signaling State',
        status: signalingState === 'stable' ? 'success' : 'warning',
        message: signalingState,
      });

      // Get ICE candidate pairs
      try {
        const stats = await peerConnection.getStats();
        const candidatePairs: string[] = [];
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            candidatePairs.push(`${report.localCandidateId} ↔ ${report.remoteCandidateId}`);
          }
        });
        diagnostics.push({
          name: 'Active ICE Pairs',
          status: candidatePairs.length > 0 ? 'success' : 'warning',
          message: `${candidatePairs.length} pair(s)`,
          details: candidatePairs.join('\n'),
        });
      } catch (error) {
        diagnostics.push({
          name: 'ICE Statistics',
          status: 'error',
          message: 'Failed to retrieve stats',
          details: String(error),
        });
      }
    } else {
      diagnostics.push({
        name: 'Peer Connection',
        status: 'warning',
        message: 'Not initialized',
      });
    }

    // Check WebRTC support
    const hasWebRTC = !!(
      window.RTCPeerConnection &&
      window.RTCSessionDescription &&
      window.RTCIceCandidate
    );
    diagnostics.push({
      name: 'WebRTC Support',
      status: hasWebRTC ? 'success' : 'error',
      message: hasWebRTC ? 'Supported' : 'Not supported',
    });

    // Check WebSocket availability (basic check)
    const hasWebSocket = !!window.WebSocket;
    diagnostics.push({
      name: 'WebSocket Support',
      status: hasWebSocket ? 'success' : 'error',
      message: hasWebSocket ? 'Available' : 'Not available',
    });

    if (ngrokStatus) {
      let status: DiagnosticResult['status'] = 'warning';
      let message = 'Tunnel not running';
      let details: string | undefined;

      if (ngrokStatus.status === 'online') {
        status = 'success';
        message = ngrokStatus.publicUrl ? `Online at ${ngrokStatus.publicUrl}` : 'Online';
      } else if (ngrokStatus.status === 'starting' || ngrokStatus.status === 'stopping') {
        status = 'warning';
        message = `Tunnel ${ngrokStatus.status}`;
      } else if (ngrokStatus.status === 'error') {
        status = 'error';
        message = 'Tunnel error';
        details = ngrokStatus.error;
      }

      diagnostics.push({
        name: 'Ngrok Tunnel',
        status,
        message,
        details,
      });
    }

    setResults(diagnostics);
    setRunning(false);
  }, [peerConnection, ngrokStatus]);

  useEffect(() => {
    if (open) {
      runDiagnostics();
    }
  }, [open, runDiagnostics]);

  const handleCopyReport = () => {
    const report = results
      .map((r) => {
        let line = `[${r.status.toUpperCase()}] ${r.name}: ${r.message}`;
        if (r.details) {
          line += `\n  Details: ${r.details}`;
        }
        return line;
      })
      .join('\n\n');
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'pending':
        return <Loader2 className="w-4 h-4 animate-spin text-text-muted" />;
    }
  };

  const getStatusBadge = (status: DiagnosticResult['status']) => {
    const variants: Record<DiagnosticResult['status'], 'default' | 'destructive' | 'secondary'> = {
      success: 'default',
      error: 'destructive',
      warning: 'secondary',
      pending: 'secondary',
    };
    return (
      <Badge variant={variants[status]} className="text-xs">
        {status}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Connection Diagnostics</DialogTitle>
          <DialogDescription>
            Check Modem connection status and troubleshoot connectivity issues.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-text-muted">
              {running ? 'Running diagnostics...' : `${results.length} checks completed`}
            </div>
            <div className="flex gap-2">
              <Button onClick={runDiagnostics} variant="outline" size="sm" disabled={running}>
                <RefreshCw className={`w-4 h-4 mr-2 ${running ? 'animate-spin' : ''}`} />
                Re-run
              </Button>
              <Button
                onClick={handleCopyReport}
                variant="outline"
                size="sm"
                disabled={results.length === 0}
              >
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Copy Report
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[400px] border border-border-subtle rounded-lg">
            <div className="p-4 space-y-3">
              {results.map((result, index) => (
                <div key={index} className="p-3 bg-background-medium rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      <span className="text-sm font-semibold">{result.name}</span>
                    </div>
                    {getStatusBadge(result.status)}
                  </div>
                  <div className="text-sm text-text-muted">{result.message}</div>
                  {result.details && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-text-muted hover:text-text-default">
                        Details
                      </summary>
                      <pre className="mt-2 p-2 bg-background-default rounded text-[10px] overflow-x-auto">
                        {result.details}
                      </pre>
                    </details>
                  )}
                </div>
              ))}

              {results.length === 0 && !running && (
                <div className="text-center text-text-muted py-8">
                  No diagnostics run yet. Click "Re-run" to start.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
