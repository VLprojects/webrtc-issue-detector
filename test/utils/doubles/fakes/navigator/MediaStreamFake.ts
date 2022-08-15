import { EventTarget } from 'event-target-shim';
import faker from 'faker';
import MediaStreamTrackFake, { MediaTrackType } from './MediaStreamTrackFake';

interface MediaStreamFakeParams {
  id?: string;
  active?: boolean;
  tracks?: MediaStreamTrack[];
}

class MediaStreamFake extends EventTarget implements MediaStream {
  private readonly tracks: MediaStreamTrack[];

  id: string;

  active: boolean;

  onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null;

  onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null;

  constructor(params: MediaStreamFakeParams = {}) {
    super();
    this.id = params.id ?? faker.datatype.uuid();
    this.active = params.active ?? true;
    this.tracks = params.tracks ?? [
      new MediaStreamTrackFake({ kind: MediaTrackType.Audio }),
      new MediaStreamTrackFake({ kind: MediaTrackType.Video }),
    ];
    this.onaddtrack = null;
    this.onremovetrack = null;
  }

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === MediaTrackType.Audio);
  }

  getTrackById(trackId: string): MediaStreamTrack | null {
    return this.tracks.find((track) => track.id === trackId) || null;
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === MediaTrackType.Video);
  }

  removeTrack(track: MediaStreamTrack): void {
    const trackIndex = this.tracks.indexOf(track);
    this.tracks.splice(trackIndex, 1);
  }

  clone(): MediaStream {
    return this;
  }
}

export default MediaStreamFake;
