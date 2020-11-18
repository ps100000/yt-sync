import { Component, OnInit } from '@angular/core';
import { auditTime, debounceTime } from 'rxjs/operators';
import { merge, isEqual, cloneDeep } from 'lodash';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { ClientState } from './models/client-state.model';
import { VideoState } from './models/video-state.model';
import { MatSliderChange } from '@angular/material/slider';

export enum ConnectionState {
  CONNECTING = 0,
  CONNECTED = 1,
  DISCONNECTING = 2
}

enum YtSyncEventType {
  SET_VIDEO_STATE = 0,
  ALL_READY = 1
  // TIME_DIFF // change play speed
}

interface YtSyncEvent {
  type: YtSyncEventType;
}

interface YtSyncSetVideoStateEvent extends YtSyncEvent {
  type: YtSyncEventType.SET_VIDEO_STATE;
  videoState: VideoState;
  syncCounter: number;
}

interface YtSyncAllReadyEvent extends YtSyncEvent {
  type: YtSyncEventType.ALL_READY;
}

// client state: new/ping/ready/removed
// event: sync needed
// event: play
// event: sync to
// event: update playlist

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  set clientState(s: ClientState){
    if (isEqual(s, this._clientState$.value)) {
      return;
    }
    console.log('new client state');
    if (s.videoState.videoId !== this._clientState$.value.videoState.videoId) {
      this.videoId = s.videoState.videoId;
    }
    this._clientState$.next(s);
  }
  get clientState(): ClientState {
    return cloneDeep(this._clientState$.value);
  }
  private _clientState$: BehaviorSubject<ClientState> = new BehaviorSubject({
    id: this.generateUID(),
    name: 'x', //TODO
    roomName: this.generateUID(12), //TODO
    ready: true,
    connectionState: ConnectionState.CONNECTING,
    videoState: {
      videoId: '',
      playing: false,
      currentTime: 0
    },
    playlist: []
  });

  set syncedVideoState(state: VideoState) {
    if (isEqual(state, this._syncedVideoState$.value)) {
      return;
    }
    console.log('new video state');
    this._syncedVideoState$.next(state);
  }
  get syncedVideoState(): VideoState {
    return cloneDeep(this._syncedVideoState$.value);
  }
  private _syncedVideoState$: BehaviorSubject<VideoState> = new BehaviorSubject({
    videoId: '',
    playing: false,
    currentTime: 0
  });
  private syncCounter = 0;

  syncWebSocket: WebSocket;
  duration: number;
  videoId = '';
  allReady = false;

  constructor() {
    combineLatest([this._clientState$, this._syncedVideoState$])
      .pipe(auditTime(500))
      .subscribe(([clientState, videoState]) => this.sendStateUpdate(clientState, videoState));
  }

  ngOnInit(): void {
    this.connectSyncWebSocket('ws://' + window.location.host + ':9000');
    this.syncedVideoState = merge(this.syncedVideoState, { videoId: 'a2ieONOQtfU' });
  }

  connectSyncWebSocket(url: string): void {
    this.syncWebSocket = new WebSocket(url);
    this.syncWebSocket.onmessage = (ev: MessageEvent) => {
      this.evaluateYtSyncEvent(JSON.parse(ev.data));
    };
  }

  evaluateYtSyncEvent(ev: YtSyncEvent): void {
    console.log('recieved event: ', ev);
    switch (ev.type) {
      case YtSyncEventType.ALL_READY:
        this.allReady = true;
        break;
      case YtSyncEventType.SET_VIDEO_STATE:
        const newState = (ev as YtSyncSetVideoStateEvent).videoState;
        this.syncedVideoState = newState;
        this.syncCounter = (ev as YtSyncSetVideoStateEvent).syncCounter;
        this.clientState = merge(this.clientState,  {videoState: newState});
        this.allReady = false;
        break;
    }
  }

  sendStateUpdate(newClientState: ClientState, newVideoState: VideoState): void {
    console.log('send state:', cloneDeep(newClientState), cloneDeep(newVideoState));
    this.syncWebSocket.send(JSON.stringify({
        clientState: newClientState,
        syncedVideoState: newVideoState,
        syncCounter: this.syncCounter
      }));
  }

  onPlayBtnClicked(): void {
    const playing = !this.clientState.videoState.playing;
    console.log('play? ', playing);
    this.syncedVideoState = merge(this.syncedVideoState, {playing} );
  }

  onTimelineChange(ev: MatSliderChange): void {
    console.log(ev.value);
    this.syncedVideoState = merge(this.syncedVideoState, {currentTime: ev.value} );
  }

  roomNameChange(roomNameChange): void {
    if (/^[a-z]{12}$/.test(roomNameChange.target.value)) {
      this.clientState = merge(this.clientState, {roomName: roomNameChange.target.value});
    }
  }

  videoIdChange(videoIdChange): void {
    if (videoIdChange.target.value.length > 8) {
      this.syncedVideoState = merge(this.syncedVideoState, {videoId: videoIdChange.target.value});
    }
  }

  onPlayerSyncedChange(synced: boolean): void {
    if (!synced) {
      this.allReady = false;
    }
    this.clientState = merge(this.clientState, {ready: synced});
  }

  onVideoProgressChange(progress: number): void {
    console.log(progress);
    this.clientState = merge(this.clientState, {videoState: {currentTime: progress}});
  }

  generateUID(length = 16): string {
    let uid = '';
    for (let i = 0; i < length; i++) {
      uid += String.fromCharCode(Math.round(Math.random() * 25) + 97);
    }
    return uid;
  }

}
