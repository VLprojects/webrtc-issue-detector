import faker from 'faker';
import { SinonStub } from 'sinon';
import AbstractDouble from './AbstractDouble';
import { GetNodeResponse } from '../../../src/types/network';
import LoadBalancerClient from '../../../src/engine/network/LoadBalancerClient';
import { Role } from '../../../src/types/common';

type GetNodeParams = Partial<GetNodeResponse>;

class LoadBalancerApiClientDouble extends AbstractDouble {
  getNodeStub?: SinonStub<[{ channelId: string, role: Role }], Promise<GetNodeResponse>>;

  initAll(): void {
    this.initGetNodeStub();
  }

  initGetNodeStub(params: GetNodeParams = {}) {
    this.getNodeStub && this.getNodeStub.restore();
    this.getNodeStub = this.sandbox.stub(LoadBalancerClient.prototype, 'getNode')
      .resolves({ webSocketUrl: params.webSocketUrl ?? faker.internet.url() });
    return this.getNodeStub;
  }
}

export default LoadBalancerApiClientDouble;
