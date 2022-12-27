import { EventEmitter } from 'events';
import {
  EventType,
  EventPayload,
  IssueDetectorResult,
  NetworkScores,
  StatsParsingFinishedPayload,
} from './types';

export declare interface WebRTCIssueEmitter {
  on(event: EventType.Issue, listener: (payload: IssueDetectorResult) => void): this;
  on(event: EventType.NetworkScoresUpdated, listener: (payload: NetworkScores) => void): this;
  on(event: EventType.StatsParsingFinished, listener: (payload: StatsParsingFinishedPayload) => void): this;
  emit(event: EventType.Issue, payload: EventPayload): boolean;
  emit(event: EventType.NetworkScoresUpdated, payload: NetworkScores): boolean;
  emit(event: EventType.StatsParsingFinished, payload: StatsParsingFinishedPayload): boolean;
}

export class WebRTCIssueEmitter extends EventEmitter {}
