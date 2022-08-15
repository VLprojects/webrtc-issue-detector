import { EventTarget } from 'event-target-shim';
import MediaStreamFake from './MediaStreamFake';
import MediaDeviceInfoFake from './MediaDeviceInfoFake';

export interface MediaDevicesFakeParams {
  mediaDevicesInfo?: MediaDeviceInfo[];
  displayMedia?: MediaStream;
  userMedia?: MediaStream;
  supportedConstraints?: MediaTrackSupportedConstraints;
}

class MediaDevicesFake extends EventTarget implements MediaDevices {
  private readonly mediaDevicesInfo: MediaDeviceInfo[];

  private readonly displayMedia: MediaStream;

  private readonly userMedia: MediaStream;

  private readonly supportedConstraints: MediaTrackSupportedConstraints;

  ondevicechange = null;

  constructor(params: MediaDevicesFakeParams = {}) {
    super();
    this.mediaDevicesInfo = params.mediaDevicesInfo ?? [
      new MediaDeviceInfoFake({ kind: 'audioinput' }),
      new MediaDeviceInfoFake({ kind: 'videoinput' }),
    ];
    this.displayMedia = params.displayMedia ?? new MediaStreamFake();
    this.userMedia = params.userMedia ?? new MediaStreamFake();
    this.supportedConstraints = params.supportedConstraints ?? {};
  }

  enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return Promise.resolve([...this.mediaDevicesInfo]);
  }

  getDisplayMedia(): Promise<MediaStream> {
    return Promise.resolve(this.displayMedia);
  }

  getUserMedia(): Promise<MediaStream> {
    return Promise.resolve(this.userMedia);
  }

  getSupportedConstraints(): MediaTrackSupportedConstraints {
    return {};
  }
}

export default MediaDevicesFake;
