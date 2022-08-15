# webrtc-issue-detector
WebRTC diagnostic tool that detects issues with network or user devices

----

## Installation
`yarn add webrtc-issue-detector`


## Usage
### Import
```typescript
import WebRTCIssueDetector from 'webrtc-issue-detector';

return new WebRTCIssueDetector({
    onIssues: (issues) => console.log('Issues detected:', issues),
    onNetworkScoresUpdated: (scores) => console.log('Network scores updated:', scores),
});
```

### Configure
```typescript
import WebRTCIssueDetector, {
  QualityLimitationsIssueDetector,
  FramesDroppedIssueDetector,
  FramesEncodedSentIssueDetector,
  InboundNetworkIssueDetector,
  OutboundNetworkIssueDetector,
  NetworkMediaSyncIssueDetector,
  AvailableOutgoingBitrateIssueDetector,
  VideoCodecMismatchDetector,
  CompositeRTCStatsParser,
  WebRTCIssueEmitter,
  NetworkScoresCalculator,
  PeriodicWebRTCStatsReporter,
  RTCStatsParser,
} from 'webrtc-issue-detector';

new WebRTCIssueDetector({
  issueEmitter: new WebRTCIssueEmitter(),
  networkScoresCalculator: new NetworkScoresCalculator(),
  detectors: [
    new QualityLimitationsIssueDetector(),
    new FramesDroppedIssueDetector(),
    new FramesEncodedSentIssueDetector(),
    new InboundNetworkIssueDetector(),
    new OutboundNetworkIssueDetector(),
    new NetworkMediaSyncIssueDetector(),
    new AvailableOutgoingBitrateIssueDetector(),
    new VideoCodecMismatchDetector(),
  ],
  statsReporter: new PeriodicWebRTCStatsReporter({
    compositeStatsParser,
    getStatsInterval: 5000,
  }),
  onIssues: params.onIssues,
  onNetworkScoresUpdated: params.onNetworkScoresUpdated,
  ignoreSSRCList: params.ignoreSSRCList,
  compositeStatsParser,
  logger,
});
```


## Test
`yarn test`


## Build
`yarn build`
