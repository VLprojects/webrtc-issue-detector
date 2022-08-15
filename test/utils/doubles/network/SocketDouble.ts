import { SinonStub } from 'sinon';
import { Socket } from 'socket.io-client';
import AbstractDouble from '../AbstractDouble';
import { SocketResponse } from '../../../../src/types/common';
import SocketIO from '../../../../src/engine/network/Socket';
import { createEventEmitter } from '../../emitter';
import { SocketIOEvents } from '../../../../src/constants/events';

type RequestParams = Partial<SocketResponse> & {
  defaultResponse?: Record<string, unknown>;
  stubCall?: {
    args: [string, {}?];
    resp: Partial<SocketResponse>;
  }[];
};

interface InitConnectStubParams {
  postConnectCallback?: () => unknown;
  socket?: SocketIO;
  stateToEmit?: SocketIOEvents;
  stateEventPayload?: Record<string, unknown>;
}

class SocketDouble extends AbstractDouble {
  requestStub?: SinonStub<[string, {}?], Promise<SocketResponse>>;

  connectStub?: SinonStub<[string], void>;

  disconnectStub?: SinonStub<[], void>;

  initAll(): void {
    this.initRequestStub();
    this.initConnectStub();
    this.initDisconnectStub();
  }

  initRequestStub(params: RequestParams = {}) {
    const defaults = {
      error: params.error,
      errorCode: params.errorCode,
      success: params.success ?? true,
    };
    this.requestStub && this.requestStub.restore();
    this.requestStub = this.sandbox.stub(SocketIO.prototype, 'request');
    this.requestStub.resolves({ ...defaults, ...(params.defaultResponse || {}) });

    (params.stubCall || []).forEach(({ args, resp }) => {
      this.requestStub!.withArgs(...args)
        .resolves({
          ...defaults,
          ...(params.defaultResponse || {}),
          ...(resp || {}),
        });
    });

    return this.requestStub;
  }

  initConnectStub(params: InitConnectStubParams = {}) {
    this.connectStub && this.connectStub.restore();
    this.connectStub = this.sandbox.stub(SocketIO.prototype, 'connect');
    this.connectStub.callsFake(() => {
      const {
        socket, stateToEmit, stateEventPayload, postConnectCallback,
      } = params;

      if (!socket) {
        return;
      }

      socket.connection = createEventEmitter() as unknown as Socket;
      // Timeout is required because otherwise the events will be fired immediately,
      // and we won't be able to wait for the socket connection.
      setTimeout(() => {
        if (postConnectCallback) {
          postConnectCallback();
        } else {
          socket.observer.emit('state', {
            state: stateToEmit ?? SocketIOEvents.Connected,
            ...(stateEventPayload || {}),
          });
        }
      });
    });

    return this.connectStub;
  }

  initDisconnectStub() {
    this.disconnectStub && this.disconnectStub.restore();
    this.disconnectStub = this.sandbox.stub(SocketIO.prototype, 'disconnect');
    return this.disconnectStub;
  }
}

export default SocketDouble;
