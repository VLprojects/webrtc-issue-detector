import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { SinonStub } from 'sinon';
import AbstractDouble from '../AbstractDouble';

class AxiosDouble extends AbstractDouble {
  axiosInstance = axios.create();

  instanceMockAdapter?: MockAdapter;

  private axiosCreateStub?: SinonStub<[config?: AxiosRequestConfig], AxiosInstance>;

  initAll(): void {
    this.initAxiosStub();
  }

  initAxiosStub() {
    this.axiosCreateStub && this.axiosCreateStub.restore();
    this.axiosCreateStub = this.sandbox.stub(axios, 'create').callsFake(() => {
      this.instanceMockAdapter = new MockAdapter(this.axiosInstance);
      return this.axiosInstance;
    });

    return {
      axiosInstance: this.axiosInstance,
      instanceMockAdapter: this.instanceMockAdapter,
    };
  }

  restoreAll() {
    this.instanceMockAdapter && this.instanceMockAdapter.restore();
    super.restoreAll();
  }
}

export default AxiosDouble;
