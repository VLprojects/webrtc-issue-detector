import { EventEmitter } from 'events';

interface SocketClientFakeTestParams {
  io?: EventEmitter;
}

class SocketIOClientFake extends EventEmitter {
  readonly io: EventEmitter;

  connected: boolean;

  disconnected: boolean;

  private readonly flags: Record<string, unknown>;

  constructor(params: SocketClientFakeTestParams = {}) {
    super();
    this.io = params.io ?? new EventEmitter();
    this.connected = true;
    this.disconnected = false;
    this.flags = {};
    this.setMaxListeners(Infinity);
  }

  get volatile() {
    this.flags.volatile = true;
    return this;
  }

  offAny(listener?: (...args: any[]) => void): this {
    if (!listener) {
      return this;
    }

    this.eventNames().forEach((eventName) => {
      const eventListeners = this.listeners(eventName);
      eventListeners.forEach((eventListener) => {
        if (eventListener === listener) {
          this.removeListener(eventName, listener);
        }
      });
    });

    return this;
  }

  close() {
    this.disconnected = true;
    this.connected = false;
    this.emit('disconnect', 'io client disconnect');
    return this;
  }

  disconnect() {
    return this.close();
  }
}

export default SocketIOClientFake;
