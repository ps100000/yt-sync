import { ConnectionState } from '../app.component';
import { VideoState } from './video-state.model';

export interface ClientState {
  readonly id: string;
  readonly name: string;
  readonly roomName: string;
  readonly ready: boolean;
  readonly connectionState: ConnectionState;
  readonly videoState: VideoState;
}
