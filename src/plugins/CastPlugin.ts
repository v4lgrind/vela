import { registerPlugin } from '@capacitor/core';

export type CastState =
  | 'NO_DEVICES_AVAILABLE'
  | 'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED';

export interface CastPlugin {
  initialize(): Promise<void>;
  showPicker(): Promise<void>;
  castMedia(options: {
    itemId: string;
    serverUrl: string;
    accessToken: string;
    startPositionTicks: number;
    title?: string;
  }): Promise<void>;
  stopCasting(): Promise<void>;
  getState(): Promise<{ state: CastState }>;
  addListener(
    event: 'castStateChanged',
    handler: (data: { state: CastState }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    event: 'sessionStarted',
    handler: (data: { sessionId: string }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    event: 'sessionEnded',
    handler: (data: Record<string, unknown>) => void
  ): Promise<{ remove: () => void }>;
}

const CastPlugin = registerPlugin<CastPlugin>('Cast');
export default CastPlugin;
