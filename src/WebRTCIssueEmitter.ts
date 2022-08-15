import { EventEmitter } from 'events';
import {
  EventType,
  EventPayload,
  IssueDetectorResult,
  NetworkScores,
} from './types';

export declare interface WebRTCIssueEmitter {
  on(event: EventType.Issue, listener: (payload: IssueDetectorResult) => void): this;
  on(event: EventType.NetworkScoresUpdated, listener: (payload: NetworkScores) => void): this;
  emit(event: EventType.Issue, payload: EventPayload): boolean;
  emit(event: EventType.NetworkScoresUpdated, payload: NetworkScores): boolean;
}

export class WebRTCIssueEmitter extends EventEmitter {}
