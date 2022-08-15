import faker from 'faker';
import EnhancedEventEmitter from '../../../../../src/EnhancedEventEmitter';
import { createEventEmitter } from '../../../emitter';

interface TransportFakeParams {
  id?: string;
  observer?: EnhancedEventEmitter;
}

class TransportFake extends EnhancedEventEmitter {
  readonly observer: EnhancedEventEmitter;

  readonly id: string;

  constructor(params: TransportFakeParams = {}) {
    super();
    this.id = params.id ?? faker.datatype.uuid();
    this.observer = params.observer ?? createEventEmitter();
  }
}

export default TransportFake;
