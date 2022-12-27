# webrtc-issue-detector

Diagnostic tool for WebRTC JS applications that analyzes WebRTC getStats() result in realtime and generates a report on possible issues.


## Key features

- **Mean opinion score** - calculates [MOS](https://en.wikipedia.org/wiki/Mean_opinion_score) for inbound and outbound network connections that can indicate problems before it even appears.
- **CPU issues** - indicates possible issues with encoding and decoding media streams.
- **Server issues** - indicates possible server side issues.
- **Fully customizable** - allows to create your own detectors or WebRTC getStats() parsers.


## Installation
`yarn add webrtc-issue-detector`


## Usage

### Getting started
```typescript
import WebRTCIssueDetector from 'webrtc-issue-detector';

// create it before the first instance of RTCPeerConnection is created
const webRtcIssueDetector = new WebRTCIssueDetector({
    onIssues: (issues) => issues.map((issue) => {
        console.log('Issues type:', issue.type); // eg. "network"
        console.log('Issues reason:', issue.reason); // eg. "outbound-network-throughput"
        console.log('Issues reason:', issue.debug); // eg. "packetLoss: 12%, jitter: 230, rtt: 150"
    }),
    onNetworkScoresUpdated: (scores) => {
        console.log('Inbound network score', scores.inbound); // eg. 3.7
        console.log('Outbound network score', scores.outbound); // eg. 4.5
    }
});

// start collecting getStats() and detecting issues
webRtcIssueDetector.watchNewPeerConnections();
```

### Configure

By default, WebRTCIssueDetector can be created with minimum of mandatory constructor parameters. But it's possible to override most of them.

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
} from 'webrtc-issue-detector';

const widWithDefaultConstructorArgs = new WebRTCIssueDetector();

// or you can fully customize WebRTCIssueDetector with constructor arguments

const widWithCustomConstructorArgs = new WebRTCIssueDetector({
  detectors: [ // you are free to change the detectors list according to your needs
    new QualityLimitationsIssueDetector(),
    new FramesDroppedIssueDetector(),
    new FramesEncodedSentIssueDetector(),
    new InboundNetworkIssueDetector(),
    new OutboundNetworkIssueDetector(),
    new NetworkMediaSyncIssueDetector(),
    new AvailableOutgoingBitrateIssueDetector(),
    new VideoCodecMismatchDetector(),
  ],
  getStatsInterval: 10_000, // set custom stats parsing interval
  onIssues: (payload: IssueDetectorResult) => {
    // your custom callback for detected issues handling
  },
  onNetworkScoresUpdated: (payload: NetworkScores) => {
    // your custom callback for networks score updates handling
  },
  ignoreSSRCList: [
    // in case you need to skip some ssrc from parsing, add its numbers to the array
  ],
});
```

## Detectors

### AvailableOutgoingBitrateIssueDetector
Detects issues with outgoing network connection.
```js
const issue = {
    type: 'network',
    reason: 'outbound-network-throughput',
    debug: '...',
}
```

### FramesDroppedIssueDetector
Detects issues with decoder.
```js
const issue = {
    type: 'cpu',
    reason: 'decoder-cpu-throttling',
    debug: '...',
}
```

### FramesEncodedSentIssueDetector
Detects issues with outbound network throughput.
```js
const issue = {
    type: 'network',
    reason: 'outbound-network-throughput',
    debug: '...',
}
```

### InboundNetworkIssueDetector
Detects issues with inbound network connection.
```js
const issue = {
    type: 'network',
    reason: 'inbound-network-quality' | 'inbound-network-media-latency' | 'network-media-sync-failure',
    iceCandidate: 'ice-candidate-id',
    debug: '...',
}
```

Also can detect server side issues if there is high RTT and jitter is ok.
```js
const issue = {
    type: 'server',
    reason: 'server-issue',
    iceCandidate: 'ice-candidate-id',
    debug: '...',
}
```

### NetworkMediaSyncIssueDetector
Detects issues with audio synchronization.
```js
const issue = {
    type: 'network',
    reason: 'network-media-sync-failure',
    ssrc: '...',
    debug: '...',
}
```

### OutboundNetworkIssueDetector
Detects issues with outbound network connection.
```js
const issue = {
    type: 'network',
    reason: 'outbound-network-quality' | 'outbound-network-media-latency',
    iceCandidate: 'ice-candidate-id',
    debug: '...',
}
```

### QualityLimitationsIssueDetector
Detects issues with encoder and outbound network. Based on native qualityLimitationReason.
```js
const issue = {
    type: 'cpu',
    reason: 'encoder-cpu-throttling',
    ssrc: '...',
    debug: '...',
}
```

```js
const issue = {
    type: 'network',
    reason: 'outbound-network-throughput',
    ssrc: '...',
    debug: '...',
}
```

### VideoCodecMismatchDetector
Detects issues with decoding stream.
```js
const issue = {
    type: 'stream',
    reason: 'codec-mismatch',
    ssrc: '...',
    trackIdentifier: '...',
    debug: '...',
}
```

## Roadmap

- [ ] Adaptive getStats() call interval based on last getStats() execution time 
- [ ] Structured issue debug
- [ ] Issues detector for user devices permissions

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)
