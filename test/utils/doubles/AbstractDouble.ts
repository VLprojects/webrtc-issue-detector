import sinon, { SinonSandbox } from 'sinon';

abstract class AbstractDouble {
  readonly sandbox: SinonSandbox;

  constructor() {
    this.sandbox = sinon.createSandbox();
  }

  restoreAll() {
    this.sandbox.restore();
  }

  abstract initAll(): void;
}

export default AbstractDouble;
