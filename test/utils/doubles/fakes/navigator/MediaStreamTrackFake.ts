import { EventTarget } from 'event-target-shim';
import faker from 'faker';

export enum MediaTrackType {
  Audio = 'audio',
  Video = 'video',
}

interface MediaStreamTrackFakeTestParams {
  id?: string;
  kind?: MediaTrackType;
  label?: string;
  muted?: boolean;
  enabled?: boolean;
  readyState?: MediaStreamTrackState;
  contentHint?: string;
  trackConstraints?: MediaTrackConstraints;
  trackCapabilities?: MediaTrackCapabilities;
  trackSettings?: MediaTrackSettings;
}

class MediaStreamTrackFake extends EventTarget implements MediaStreamTrack {
  private constraints: MediaTrackConstraints;

  private readonly capabilities: MediaTrackCapabilities;

  private readonly settings: MediaTrackSettings;

  id: string;

  kind: MediaTrackType;

  label: string;

  muted: boolean;

  readyState: MediaStreamTrackState;

  enabled: boolean;

  contentHint: string;

  onended: ((this: MediaStreamTrack, ev: Event) => any) | null;

  onmute: ((this: MediaStreamTrack, ev: Event) => any) | null;

  onunmute: ((this: MediaStreamTrack, ev: Event) => any) | null;

  constructor(params: MediaStreamTrackFakeTestParams = {}) {
    super();
    this.constraints = params.trackConstraints ?? {};
    this.capabilities = params.trackCapabilities ?? {};
    this.settings = params.trackSettings ?? {};
    this.id = params.id ?? faker.datatype.uuid();
    this.kind = params.kind ?? MediaTrackType.Audio;
    this.label = params.label ?? faker.lorem.words();
    this.muted = params.muted ?? false;
    this.readyState = params.readyState ?? 'live';
    this.enabled = params.enabled ?? true;
    this.contentHint = params.contentHint ?? faker.lorem.slug();
    this.onended = null;
    this.onmute = null;
    this.onunmute = null;
  }

  applyConstraints(constraints: MediaTrackConstraints = {}): Promise<void> {
    this.constraints = constraints;
    return Promise.resolve();
  }

  getCapabilities(): MediaTrackCapabilities {
    return this.capabilities;
  }

  getConstraints(): MediaTrackConstraints {
    return this.constraints;
  }

  getSettings(): MediaTrackSettings {
    return this.settings;
  }

  stop(): void {
    this.readyState = 'ended';
  }

  clone(): MediaStreamTrack {
    return this;
  }
}

export default MediaStreamTrackFake;
