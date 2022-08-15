import faker from 'faker';

export interface MediaDeviceInfoFakeParams {
  deviceId?: string;
  groupId?: string;
  kind?: MediaDeviceKind;
  label?: string;
}

class MediaDeviceInfoFake implements MediaDeviceInfo {
  deviceId: string;

  groupId: string;

  kind: MediaDeviceKind;

  label: string;

  constructor(params: MediaDeviceInfoFakeParams = {}) {
    this.deviceId = params.deviceId ?? faker.datatype.uuid();
    this.groupId = params.groupId ?? faker.lorem.slug();
    this.kind = params.kind ?? 'audioinput';
    this.label = params.label ?? faker.lorem.words();
  }

  toJSON(): any {
    return {
      ...this,
    };
  }
}

export default MediaDeviceInfoFake;
