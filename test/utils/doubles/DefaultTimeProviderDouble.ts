import { SinonStub } from 'sinon';
import AbstractDouble from './AbstractDouble';
import DefaultTimeProvider from '../../../src/helpers/datetime';

class DefaultTimeProviderDouble extends AbstractDouble {
  sleepMsStub?: SinonStub<[number], Promise<void>>;

  nowStub?: SinonStub<[], Date>;

  initAll(): void {
    this.initSleepMsStub();
    this.initNowStub();
  }

  initSleepMsStub() {
    this.sleepMsStub && this.sleepMsStub.restore();
    this.sleepMsStub = this.sandbox.stub(DefaultTimeProvider.prototype, 'sleepMs')
      .resolves(undefined);
    return this.sleepMsStub;
  }

  initNowStub(nowValue?: Date) {
    this.nowStub && this.nowStub.restore();
    this.nowStub = this.sandbox.stub(DefaultTimeProvider.prototype, 'now')
      .returns(nowValue ?? new Date(Date.now()));
    return this.nowStub;
  }
}

export default DefaultTimeProviderDouble;
