import { SinonStub } from 'sinon';
import { Device } from 'mediasoup-client';
import { Transport, TransportOptions } from 'mediasoup-client/lib/Transport';
import { RtpCapabilities } from 'mediasoup-client/src/RtpParameters';
import { SctpCapabilities } from 'mediasoup-client/src/SctpParameters';
import AbstractDouble from '../AbstractDouble';
import TransportFake from '../fakes/mediasoup/TransportFake';
import Media from '../../../../src/engine/media';
import DeviceFake from '../fakes/mediasoup/DeviceFake';

type RTPCapabilitiesParams = RtpCapabilities | Record<string, unknown>;
type SCTPCapabilitiesParams = SctpCapabilities | Record<string, unknown>;
type TransportParams = { transport?: Transport; };

class DeviceDouble extends AbstractDouble {
  mediasoupDeviceGetterStub?: SinonStub<unknown[], Promise<Device>>;

  loadStub?: SinonStub<[{ routerRtpCapabilities: RtpCapabilities }], Promise<void>>;

  rtpCapabilitiesStub?: SinonStub<unknown[], RTPCapabilitiesParams>;

  sctpCapabilitiesStub?: SinonStub<unknown[], SCTPCapabilitiesParams>;

  createSendTransportStub?: SinonStub<[TransportOptions], Transport>;

  createRecvTransportStub?: SinonStub<[TransportOptions], Transport>;

  initAll(): void {
    this.initMediasoupDeviceGetterStub();
    this.initRtpCapabilitiesStub();
    this.initSctpCapabilitiesStub();
    this.initCreateSendTransportStub();
    this.initCreateRecvTransportStub();
  }

  initMediasoupDeviceGetterStub() {
    const device = new DeviceFake();

    this.mediasoupDeviceGetterStub && this.mediasoupDeviceGetterStub.restore();
    this.mediasoupDeviceGetterStub = this.sandbox.stub(Media.prototype, 'mediasoupDevice')
      .get(() => device);
    return this.mediasoupDeviceGetterStub;
  }

  initRtpCapabilitiesStub(params: RTPCapabilitiesParams = {}) {
    this.rtpCapabilitiesStub && this.rtpCapabilitiesStub.restore();
    this.rtpCapabilitiesStub = this.sandbox.stub(Device.prototype, 'rtpCapabilities')
      .returns(params);
    return this.rtpCapabilitiesStub;
  }

  initSctpCapabilitiesStub(params: RTPCapabilitiesParams = {}) {
    this.sctpCapabilitiesStub && this.sctpCapabilitiesStub.restore();
    this.sctpCapabilitiesStub = this.sandbox.stub(Device.prototype, 'sctpCapabilities')
      .returns(params);
    return this.sctpCapabilitiesStub;
  }

  initCreateSendTransportStub(params: TransportParams = {}) {
    this.createSendTransportStub && this.createSendTransportStub.restore();
    this.createSendTransportStub = this.sandbox.stub(Device.prototype, 'createSendTransport')
      .returns(params.transport ?? (new TransportFake()) as unknown as Transport);
    return this.createSendTransportStub;
  }

  initCreateRecvTransportStub(params: TransportParams = {}) {
    this.createRecvTransportStub && this.createRecvTransportStub.restore();
    this.createRecvTransportStub = this.sandbox.stub(Device.prototype, 'createRecvTransport')
      .returns(params.transport ?? (new TransportFake()) as unknown as Transport);
    return this.createRecvTransportStub;
  }
}

export default DeviceDouble;
