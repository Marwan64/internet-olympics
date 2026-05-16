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

// ── Main Hook ──────────────────────────────────────────────────────────────────

export function useSocket() {
  const socketRef = useRef<TypedSocket | null>(null);
  const store = useGameStore();

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    // ── Connection Events ──────────────────────────────────────────────────

    socket.on('connect', () => {
      store.setConnection({ connected: true, reconnecting: false });
      store.addToast({ type: 'success', message: '🟢 Connected!', duration: 2000 });
    });

    socket.on('disconnect', (reason) => {
      store.setConnection({ connected: false });
      if (reason !== 'io client disconnect') {
        store.addToast({ type: 'error', message: '🔴 Disconnected. Reconnecting...', duration: 3000 });
      }
    });

    socket.on('connect_error', () => {
      store.setConnection({ connected: false, reconnecting: true });
    });

    socket.io.on('reconnect_attempt', () => {
      store.setConnection({ reconnecting: true });
    });

    socket.io.on('reconnect', () => {
      store.setConnection({ connected: true, reconnecting: false });
      store.addToast({ type: 'success', message: '✅ Reconnected!', duration: 2000 });
    });

    // ── Lobby Events ───────────────────────────────────────────────────────

    socket.on('lobby:updated', (room: Room) => {
      store.setRoom(room);
    });

    socket.on('lobby:error', ({ message }: { message: string }) => {
      store.addToast({ type: 'error', message });
    });

    socket.on('lobby:chat', (msg: ChatMessage) => {
      store.addChatMessage(msg);
    });

    socket.on('lobby:playerReady', (_playerId: string, _ready: boolean) => {
      // room update handles this
    });

    socket.on('lobby:hostChanged', (_newHostId: string) => {
      store.addToast({ type: 'info', message: '👑 Host has changed' });
    });

    // ── Game Events ────────────────────────────────────────────────────────

    socket.on('game:countdown', (seconds: number) => {
      store.setGameCountdown(seconds);
      if (seconds === 3) {
        store.addToast({ type: 'info', message: '🎮 Game starting!', duration: 4000 });
      }
    });

    socket.on('game:begin', (state: GameState) => {
      store.setGameState(state);
      store.setGameCountdown(null);
      store.setScreen('game');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('game:state', (state: any) => {
      store.setGameState(state as GameState);
    });

    socket.on('game:end', (results: GameResults) => {
      store.setGameResults(results);
    });

    // Personal per-player data (speed typing words etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('game:personal', (data: PersonalGameData) => {
      store.setPersonalData(data);
    });

    // ── Session Events ─────────────────────────────────────────────────────

    socket.on('session:podium', (data: PodiumData) => {
      store.setPodiumData(data);
    });

    // ── Chaos Events ───────────────────────────────────────────────────────

    socket.on('chaos:event', (event: ChaosEvent) => {
      store.triggerChaos(event);
    });

    socket.on('chaos:announcement', (text: string) => {
      store.setChaosAnnouncement(text);
      store.addToast({ type: 'chaos', message: text, duration: 3000 });
    });

    // ── System ─────────────────────────────────────────────────────────────

    socket.on('system:ping', (ts: number) => {
      socket.emit('system:pong', ts);
      store.setConnection({ latency: Date.now() - ts });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('lobby:updated');
      socket.off('lobby:error');
      socket.off('lobby:chat');
      socket.off('lobby:playerReady');
      socket.off('lobby:hostChanged');
      socket.off('game:countdown');
      socket.off('game:begin');
      socket.off('game:state');
      socket.off('game:end');
      socket.off('session:podium');
      socket.off('chaos:event');
      socket.off('chaos:announcement');
      socket.off('system:ping');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).off('game:personal');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emitters ───────────────────────────────────────────────────────────────

  const createRoom = useCallback(
    (username: string, avatar: string, color: string) =>
      new Promise<{ room: Room; playerId: string }>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket) { reject(new Error('Not connected')); return; }

        socket.emit(
          'lobby:create',
          { username, avatar, color },
          (res: LobbyResponse<{ room: Room; playerId: string }>) => {
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
        if (!socket) { reject(new Error('Not connected')); return; }

        socket.emit(
          'lobby:join',
          { code, username, avatar, color },
          (res: LobbyResponse<{ room: Room; playerId: string }>) => {
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
    socketRef.current?.emit('lobby:leave');
    store.clearRoom();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setReady = useCallback((ready: boolean) => {
    socketRef.current?.emit('lobby:ready', ready);
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('lobby:start');
  }, []);

  const sendChat = useCallback((message: string) => {
    socketRef.current?.emit('lobby:chat', message);
  }, []);

  const sendInput = useCallback((type: string, payload: Record<string, unknown>) => {
    socketRef.current?.emit('game:input', { type, payload });
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
