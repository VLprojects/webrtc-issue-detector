import { Device } from 'mediasoup-client';
import { FakeHandler } from 'mediasoup-client/lib/handlers/FakeHandler';

class DeviceFake extends Device {
  constructor() {
    super({
      handlerFactory: () => new FakeHandler({}),
    });
  }

  load(): Promise<void> {
    // @ts-ignore
    this._loaded = true;
    return Promise.resolve();
  }
}

export default DeviceFake;
