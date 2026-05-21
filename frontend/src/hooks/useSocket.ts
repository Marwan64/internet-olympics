'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '@/store/gameStore';
import {
  Room,
  GameState,
  ChaosEvent,
  ChatMessage,
  GameResults,
  PodiumData,
  PersonalGameData,
  LobbyResponse,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let globalSocket: TypedSocket | null = null;
// Track whether we've already bound the server→client listeners so multiple
// components calling useSocket() don't register duplicates — or worse, have
// their cleanup tear down another component's listeners.
let listenersAttached = false;

export function getSocket(): TypedSocket {
  if (!globalSocket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
    globalSocket = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    }) as unknown as TypedSocket;
  }
  return globalSocket;
}

// ── Attach server→client listeners exactly once ────────────────────────────────
// Called by the top-level page component. Sub-components should call
// useSocketActions() instead so they never touch listeners.

export function useSocket() {
  const socketRef = useRef<TypedSocket | null>(null);
  const store = useGameStore();

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    // Only register server→client listeners once across the whole app lifetime.
    if (listenersAttached) return;
    listenersAttached = true;

    // ── Connection ─────────────────────────────────────────────────────────

    socket.on('connect', () => {
      useGameStore.getState().setConnection({ connected: true, reconnecting: false });
      useGameStore.getState().addToast({ type: 'success', message: '🟢 Connected!', duration: 2000 });
    });

    socket.on('disconnect', (reason) => {
      useGameStore.getState().setConnection({ connected: false });
      if (reason !== 'io client disconnect') {
        useGameStore.getState().addToast({ type: 'error', message: '🔴 Disconnected. Reconnecting...', duration: 3000 });
      }
    });

    socket.on('connect_error', () => {
      useGameStore.getState().setConnection({ connected: false, reconnecting: true });
    });

    socket.io.on('reconnect_attempt', () => {
      useGameStore.getState().setConnection({ reconnecting: true });
    });

    socket.io.on('reconnect', () => {
      useGameStore.getState().setConnection({ connected: true, reconnecting: false });
      useGameStore.getState().addToast({ type: 'success', message: '✅ Reconnected!', duration: 2000 });
    });

    // ── Lobby ──────────────────────────────────────────────────────────────

    socket.on('lobby:updated', (room: Room) => {
      useGameStore.getState().setRoom(room);
    });

    socket.on('lobby:error', ({ message }: { message: string }) => {
      useGameStore.getState().addToast({ type: 'error', message });
    });

    socket.on('lobby:chat', (msg: ChatMessage) => {
      useGameStore.getState().addChatMessage(msg);
    });

    socket.on('lobby:playerReady', (_playerId: string, _ready: boolean) => {});

    socket.on('lobby:hostChanged', (_newHostId: string) => {
      useGameStore.getState().addToast({ type: 'info', message: '👑 Host has changed' });
    });

    // ── Game ───────────────────────────────────────────────────────────────

    socket.on('game:countdown', (seconds: number) => {
      useGameStore.getState().setGameCountdown(seconds);
      if (seconds === 3) {
        useGameStore.getState().addToast({ type: 'info', message: '🎮 Game starting!', duration: 4000 });
      }
    });

    socket.on('game:begin', (state: GameState) => {
      const s = useGameStore.getState();
      s.clearGame();
      s.setGameState(state);
      s.setGameCountdown(null);
      s.setScreen('game');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('game:state', (state: any) => {
      useGameStore.getState().setGameState(state as GameState);
    });

    socket.on('game:end', (results: GameResults) => {
      useGameStore.getState().setGameResults(results);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('game:personal', (data: PersonalGameData) => {
      useGameStore.getState().setPersonalData(data);
    });

    // ── Session ────────────────────────────────────────────────────────────

    socket.on('session:podium', (data: PodiumData) => {
      useGameStore.getState().setPodiumData(data);
    });

    // ── Chaos ──────────────────────────────────────────────────────────────

    socket.on('chaos:event', (event: ChaosEvent) => {
      useGameStore.getState().triggerChaos(event);
    });

    socket.on('chaos:announcement', (text: string) => {
      useGameStore.getState().setChaosAnnouncement(text);
      useGameStore.getState().addToast({ type: 'chaos', message: text, duration: 3000 });
    });

    // ── System ─────────────────────────────────────────────────────────────

    socket.on('system:ping', (ts: number) => {
      socket.emit('system:pong', ts);
      useGameStore.getState().setConnection({ latency: Date.now() - ts });
    });

    // No cleanup — listeners are intentionally permanent for the app lifetime.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emitters ───────────────────────────────────────────────────────────────

  const createRoom = useCallback(
    (username: string, avatar: string, color: string) =>
      new Promise<{ room: Room; playerId: string }>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          reject(new Error('Not connected to server. Please wait and try again.'));
          return;
        }

        const timer = setTimeout(() => {
          reject(new Error('Server did not respond. The backend may be waking up — try again in a few seconds.'));
        }, 10_000);

        socket.emit(
          'lobby:create',
          { username, avatar, color },
          (res: LobbyResponse<{ room: Room; playerId: string }>) => {
            clearTimeout(timer);
            if (res.success) {
              store.setRoom(res.data.room);
              store.setPlayerId(res.data.playerId);
              store.setScreen('lobby');
              resolve(res.data);
            } else {
              reject(new Error(res.error));
            }
          }
        );
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const joinRoom = useCallback(
    (code: string, username: string, avatar: string, color: string) =>
      new Promise<{ room: Room; playerId: string }>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          reject(new Error('Not connected to server. Please wait and try again.'));
          return;
        }

        const timer = setTimeout(() => {
          reject(new Error('Server did not respond. The backend may be waking up — try again in a few seconds.'));
        }, 10_000);

        socket.emit(
          'lobby:join',
          { code, username, avatar, color },
          (res: LobbyResponse<{ room: Room; playerId: string }>) => {
            clearTimeout(timer);
            if (res.success) {
              store.setRoom(res.data.room);
              store.setPlayerId(res.data.playerId);
              store.setScreen('lobby');
              resolve(res.data);
            } else {
              reject(new Error(res.error));
            }
          }
        );
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const leaveRoom = useCallback(() => {
    getSocket().emit('lobby:leave');
    store.clearRoom();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setReady = useCallback((ready: boolean) => {
    getSocket().emit('lobby:ready', ready);
  }, []);

  const startGame = useCallback(() => {
    getSocket().emit('lobby:start');
  }, []);

  const sendChat = useCallback((message: string) => {
    getSocket().emit('lobby:chat', message);
  }, []);

  const sendInput = useCallback((type: string, payload: Record<string, unknown>) => {
    getSocket().emit('game:input', { type, payload });
  }, []);

  return {
    socket: socketRef.current,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    sendChat,
    sendInput,
  };
}

// ── Lightweight hook for sub-components that only need to emit ─────────────────
// Use this in game components (SpeedTypingGame, FakeTriviaGame, etc.) instead
// of useSocket() to avoid touching listeners.

export function useSocketActions() {
  const leaveRoom = useCallback(() => {
    getSocket().emit('lobby:leave');
    useGameStore.getState().clearRoom();
  }, []);

  const setReady = useCallback((ready: boolean) => {
    getSocket().emit('lobby:ready', ready);
  }, []);

  const startGame = useCallback(() => {
    getSocket().emit('lobby:start');
  }, []);

  const sendChat = useCallback((message: string) => {
    getSocket().emit('lobby:chat', message);
  }, []);

  const sendInput = useCallback((type: string, payload: Record<string, unknown>) => {
    getSocket().emit('game:input', { type, payload });
  }, []);

  return { leaveRoom, setReady, startGame, sendChat, sendInput };
}
