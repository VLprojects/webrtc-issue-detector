import { EventEmitter } from 'events';
import { SinonSpy, SinonStub } from 'sinon';
import * as IO from 'socket.io-client';
import AbstractDouble from '../AbstractDouble';
import SocketIOClientFake from '../fakes/network/SocketIOClientFake';

type HandlerArgs = (...args: any[]) => void;

class SocketClientDouble extends AbstractDouble {
  clientStub?: SinonStub<[uri: string | Partial<IO.ManagerOptions & IO.SocketOptions>, opts?: Partial<IO.ManagerOptions & IO.SocketOptions>], IO.Socket>;

  onSpy?: SinonSpy<[string | symbol, HandlerArgs], SocketIOClientFake>;

  ioOnSpy?: SinonSpy<[string | symbol, HandlerArgs], EventEmitter>;

  offAnySpy?: SinonSpy<[listener?: (...args: any[]) => void | undefined], SocketIOClientFake>;

  disconnectSpy?: SinonSpy<[], SocketIOClientFake>;

  readonly client: SocketIOClientFake;

  constructor() {
    super();
    this.client = new SocketIOClientFake();
  }

  initAll(): void {
    this.initSocketClientStub();
    this.initSocketClientOnSpy();
    this.initSocketClientIOOnSpy();
    this.initSocketClientOffAnySpy();
    this.initSocketClientDisconnectSpy();
  }

  initSocketClientStub() {
    this.clientStub && this.clientStub.restore();
    this.clientStub = this.sandbox.stub(IO, 'io').returns(this.client as any);
    return this.clientStub;
  }

  initSocketClientOnSpy() {
    this.onSpy && this.onSpy.restore();
    this.onSpy = this.sandbox.spy(this.client, 'on');
    return this.onSpy;
  }

  initSocketClientIOOnSpy() {
    this.ioOnSpy && this.ioOnSpy.restore();
    this.ioOnSpy = this.sandbox.spy(this.client.io, 'on');
    return this.ioOnSpy;
  }

  initSocketClientOffAnySpy() {
    this.offAnySpy && this.offAnySpy.restore();
    this.offAnySpy = this.sandbox.spy(this.client, 'offAny');
    return this.offAnySpy;
  }

  initSocketClientDisconnectSpy() {
    this.disconnectSpy && this.disconnectSpy.restore();
    this.disconnectSpy = this.sandbox.spy(this.client, 'disconnect');
    return this.disconnectSpy;
  }

  get doubles() {
    if (!this.ioOnSpy || !this.onSpy) {
      throw new Error('No all stubs are initialized');
    }

    return {
      onSpy: this.onSpy,
      ioOnSpy: this.ioOnSpy,
      offAnySpy: this.offAnySpy,
      disconnectSpy: this.disconnectSpy,
    };
  }
}

export default SocketClientDouble;
