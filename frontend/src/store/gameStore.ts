'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Room,
  Player,
  GameState,
  ChaosEvent,
  ChatMessage,
  PodiumData,
  GameResults,
  PersonalGameData,
  ToastMessage,
  ConnectionState,
} from '@/types';

// ── State Interface ────────────────────────────────────────────────────────────

interface GameStore {
  // Player
  playerId: string | null;
  playerName: string;
  playerAvatar: string;
  playerColor: string;

  // Room
  room: Room | null;
  roomCode: string | null;

  // Game
  gameState: GameState | null;
  personalData: PersonalGameData | null;
  gameResults: GameResults | null;
  podiumData: PodiumData | null;
  gameCountdown: number | null;

  // Chaos
  activeChaosEvent: ChaosEvent | null;
  chaosAnnouncement: string | null;

  // Chat
  chatMessages: ChatMessage[];

  // Connection
  connection: ConnectionState;

  // UI
  toasts: ToastMessage[];
  screen: 'home' | 'lobby' | 'game' | 'podium';

  // ── Actions ────────────────────────────────────────────────────────────────

  // Player setup
  setPlayerName: (name: string) => void;
  setPlayerAvatar: (avatar: string) => void;
  setPlayerColor: (color: string) => void;

  // Room
  setRoom: (room: Room) => void;
  setPlayerId: (id: string) => void;
  setRoomCode: (code: string) => void;
  clearRoom: () => void;
  updatePlayer: (player: Partial<Player>) => void;

  // Game
  setGameState: (state: GameState) => void;
  setPersonalData: (data: PersonalGameData) => void;
  setGameResults: (results: GameResults) => void;
  setPodiumData: (data: PodiumData) => void;
  setGameCountdown: (seconds: number | null) => void;
  clearGame: () => void;

  // Chaos
  triggerChaos: (event: ChaosEvent) => void;
  setChaosAnnouncement: (text: string | null) => void;
  clearChaos: () => void;

  // Chat
  addChatMessage: (msg: ChatMessage) => void;

  // Connection
  setConnection: (state: Partial<ConnectionState>) => void;

  // UI
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  setScreen: (screen: GameStore['screen']) => void;

  // Reset
  resetAll: () => void;
}

const initialState = {
  playerId: null,
  playerName: '',
  playerAvatar: '🎮',
  playerColor: '#7C3AED',
  room: null,
  roomCode: null,
  gameState: null,
  personalData: null,
  gameResults: null,
  podiumData: null,
  gameCountdown: null,
  activeChaosEvent: null,
  chaosAnnouncement: null,
  chatMessages: [],
  connection: { connected: false, reconnecting: false, latency: 0 },
  toasts: [],
  screen: 'home' as const,
};

// ── Store ──────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ── Player ──────────────────────────────────────────────────────────

      setPlayerName: (name) => set({ playerName: name }),
      setPlayerAvatar: (avatar) => set({ playerAvatar: avatar }),
      setPlayerColor: (color) => set({ playerColor: color }),

      // ── Room ────────────────────────────────────────────────────────────

      setRoom: (room) => set({ room, roomCode: room.code }),
      setPlayerId: (id) => set({ playerId: id }),
      setRoomCode: (code) => set({ roomCode: code }),

      clearRoom: () =>
        set({
          room: null,
          roomCode: null,
          playerId: null,
          chatMessages: [],
          gameState: null,
          personalData: null,
          gameResults: null,
          podiumData: null,
          gameCountdown: null,
          activeChaosEvent: null,
          chaosAnnouncement: null,
          screen: 'home',
        }),

      updatePlayer: (updates) => {
        const { room, playerId } = get();
        if (!room || !playerId) return;
        set({
          room: {
            ...room,
            players: room.players.map((p: Player) =>
              p.id === playerId ? { ...p, ...updates } : p
            ),
          },
        });
      },

      // ── Game ────────────────────────────────────────────────────────────

      setGameState: (gameState) => set({ gameState, screen: 'game' }),
      setPersonalData: (personalData) => set({ personalData }),
      setGameResults: (gameResults) => set({ gameResults }),
      setPodiumData: (podiumData) => set({ podiumData, screen: 'podium' }),
      setGameCountdown: (gameCountdown) => set({ gameCountdown }),

      clearGame: () =>
        set({
          gameState: null,
          personalData: null,
          gameResults: null,
          gameCountdown: null,
          activeChaosEvent: null,
          chaosAnnouncement: null,
        }),

      // ── Chaos ───────────────────────────────────────────────────────────

      triggerChaos: (event) => {
        set({ activeChaosEvent: event });
        setTimeout(() => set({ activeChaosEvent: null }), event.duration);
      },

      setChaosAnnouncement: (text) => {
        set({ chaosAnnouncement: text });
        if (text) setTimeout(() => set({ chaosAnnouncement: null }), 3000);
      },

      clearChaos: () => set({ activeChaosEvent: null, chaosAnnouncement: null }),

      // ── Chat ────────────────────────────────────────────────────────────

      addChatMessage: (msg) =>
        set((state) => ({
          chatMessages: [...state.chatMessages.slice(-99), msg],
        })),

      // ── Connection ──────────────────────────────────────────────────────

      setConnection: (partial) =>
        set((state) => ({ connection: { ...state.connection, ...partial } })),

      // ── UI ──────────────────────────────────────────────────────────────

      addToast: (toast) => {
        const id = Math.random().toString(36).slice(2);
        const duration = toast.duration ?? 4000;

        set((state) => ({
          toasts: [...state.toasts, { ...toast, id }],
        }));

        setTimeout(() => {
          set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
        }, duration);
      },

      removeToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      setScreen: (screen) => set({ screen }),

      // ── Reset ────────────────────────────────────────────────────────────

      resetAll: () => set(initialState),
    }),
    {
      name: 'io-game-storage',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? sessionStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
      partialize: (state) => ({
        playerName: state.playerName,
        playerAvatar: state.playerAvatar,
        playerColor: state.playerColor,
      }),
    }
  )
);

// ── Convenience selectors ──────────────────────────────────────────────────────

export const usePlayer = () =>
  useGameStore((s) => ({
    id: s.playerId,
    name: s.playerName,
    avatar: s.playerAvatar,
    color: s.playerColor,
  }));

export const useRoom = () => useGameStore((s) => s.room);
export const useGameState = () => useGameStore((s) => s.gameState);
export const usePersonalData = () => useGameStore((s) => s.personalData);
export const useActiveChaos = () => useGameStore((s) => s.activeChaosEvent);
export const useChaosAnnouncement = () => useGameStore((s) => s.chaosAnnouncement);
export const useConnection = () => useGameStore((s) => s.connection);
export const useToasts = () => useGameStore((s) => s.toasts);
export const useScreen = () => useGameStore((s) => s.screen);
