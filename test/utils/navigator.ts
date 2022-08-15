import MediaDeviceInfoFake, { MediaDeviceInfoFakeParams } from './doubles/fakes/navigator/MediaDeviceInfoFake';
import MediaDevicesFake, { MediaDevicesFakeParams } from './doubles/fakes/navigator/MediaDevicesFake';

export const createMediaDevices = (params: MediaDevicesFakeParams = {}): MediaDevices => new MediaDevicesFake(params);

export const createMediaDeviceInfo = (params: MediaDeviceInfoFakeParams = {}): MediaDeviceInfo => new MediaDeviceInfoFake(params);
