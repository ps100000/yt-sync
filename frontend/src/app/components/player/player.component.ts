import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { YouTubePlayer } from '@angular/youtube-player';
import { isEqual, cloneDeep } from 'lodash';
import { timer } from 'rxjs';
import { VideoState } from 'src/app/models/video-state.model';

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.scss']
})
export class PlayerComponent implements OnInit {
  @ViewChild('player', {static: true}) player: YouTubePlayer;

  @Input()
  set videoState(state: VideoState) {
    if (isEqual(state, this._videoState)) {
      return;
    }
    console.log('sync to ', state);
    
    this.applyNewVideoState(this._videoState, state);
    this._videoState = state;
  }
  get videoState(): VideoState {
    return cloneDeep(this._videoState);
  }
  private _videoState: VideoState = {
    videoId: '',
    playing: false,
    currentTime: 0
  };

  @Input()
  set allReady(ready: boolean) {
    this._allReady = ready;
    if (ready) {
      this.playing = this.videoState.playing;
    }
  }
  get allReady(): boolean {
    return this._allReady;
  }
  private _allReady = false;

  @Input()
  set volume(volume: number) {
    this.player.setVolume(volume);
  }

  @Output() synced = new EventEmitter<boolean>();

  @Output() videoProgress = new EventEmitter<number>();

  @Output() duration = new EventEmitter<number>();
  private _duration = 0;

  get videoId(): string {
    return this._videoId;
  }
  private _videoId = '';

  private set playing(p: boolean) {
    console.trace(p);
    this._playing = p;
    if (p) {
      this.player.playVideo();
    } else {
      this.player.pauseVideo();
    }
  }
  private get playing(): boolean {
    return this._playing;
  }
  private _playing = false;

  constructor() {
  }

  ngOnInit(): void {
    // This code loads the IFrame Player API code asynchronously, according to the instructions at
    // https://developers.google.com/youtube/iframe_api_reference#Getting_Started

    this.loadIframeApi();


    this.player.playerVars = {
      disablekb: YT.KeyboardControls.Disable,
      controls: YT.Controls.Hide,
      rel: YT.RelatedVideos.Hide,
      modestbranding: YT.ModestBranding.Modest,
      playlist: ''
    };

    this.player.stateChange.subscribe(
    (ev: YT.OnStateChangeEvent) => {
      if (!this._duration && this.player.getDuration() > 0) {
        this._duration = this.player.getDuration();
        this.duration.next(this._duration);
      }
      console.log(this._duration, ev);
      switch (ev.data) {
        case YT.PlayerState.BUFFERING:
          this.synced.next(false);
          break;
        case YT.PlayerState.PAUSED:
        case YT.PlayerState.PLAYING:
        case YT.PlayerState.CUED:
          if (!this.allReady) {
            this.playing = false;
          } else {
            this.playing = this.videoState.playing;
          }
          this.synced.next(true);
          break;
      }
    });

    timer(0, 250).subscribe(() =>
      this.videoProgress.next(this.player.getCurrentTime())
    );
  }

  private loadIframeApi(): void {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
  }

  private applyNewVideoState(old: VideoState, s: VideoState): void {
    let update = old.playing !== s.playing;
    if (s.currentTime !== old.currentTime) {
      this.player.seekTo(s.currentTime, true);
      update = true;
    }
    if (s.videoId !== old.videoId) {
      this.duration.next(0);
      this._videoId = s.videoId;
      update = true;
    }
    if (update) {
      this.synced.next(false);
      this.playing = s.playing;
    }
  }
}
