# webrtc-issue-detector

Diagnostic tool for WebRTC JS applications that analyzes WebRTC getStats() result in realtime and generates a report on possible issues.


## Key features

- **Mean opinion score** - calculates [MOS](https://en.wikipedia.org/wiki/Mean_opinion_score) for inbound and outbound network connections that can indicate a problem before it even appears.
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
        console.log('Stats:', issue.statsSample); // eg. "packetLossPct: 12%, avgJitter: 230, rtt: 150"
    }),
    onNetworkScoresUpdated: (scores) => {
        console.log('Inbound network score', scores.inbound); // eg. 3.7
        console.log('Outbound network score', scores.outbound); // eg. 4.5
        console.log('Network stats', scores.statsSamples); // eg. { inboundStatsSample: { avgJitter: 0.1, rtt: 30, packetsLoss: 8 }, ... }
    }
});

// start collecting getStats() and detecting issues
webRtcIssueDetector.watchNewPeerConnections();

// stop collecting WebRTC stats and issues detection
webRtcIssueDetector.stopWatchingNewPeerConnections();
```

### Configure

By default, WebRTCIssueDetector can be created with minimum of mandatory constructor parameters. But it's possible to override most of them.

```typescript
import WebRTCIssueDetector, {
  QualityLimitationsIssueDetector,
  InboundNetworkIssueDetector,
  OutboundNetworkIssueDetector,
  NetworkMediaSyncIssueDetector,
  AvailableOutgoingBitrateIssueDetector,
  UnknownVideoDecoderImplementationDetector,
  FrozenVideoTrackDetector,
  VideoDecoderIssueDetector,
} from 'webrtc-issue-detector';

const widWithDefaultConstructorArgs = new WebRTCIssueDetector();

// or you can fully customize WebRTCIssueDetector with constructor arguments

const widWithCustomConstructorArgs = new WebRTCIssueDetector({
  detectors: [ // you are free to change the detectors list according to your needs
    new QualityLimitationsIssueDetector(),
    new InboundNetworkIssueDetector(),
    new OutboundNetworkIssueDetector(),
    new NetworkMediaSyncIssueDetector(),
    new AvailableOutgoingBitrateIssueDetector(),
    new UnknownVideoDecoderImplementationDetector(),
    new FrozenVideoTrackDetector(),
    new VideoDecoderIssueDetector(),
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
const exampleIssue = {
    type: 'network',
    reason: 'outbound-network-throughput',
    statsSample: {
      availableOutgoingBitrate: 1234,
      videoStreamsTotalBitrate: 1234,
      audioStreamsTotalTargetBitrate: 1234,
    },
}
```

### VideoDecoderIssueDetector
Detects issues with decoder.
```js
const exampleIssue = {
    type: 'cpu',
    reason: 'decoder-cpu-throttling',
    statsSample: {
      affectedStreamsPercent: 67,
      throtthedStreams: [
        { ssrc: 123, allDecodeTimePerFrame: [1.2, 1.6, 1.9, 2.4, 2.9], volatility: 1.7 },
      ]
    },
}
```

### InboundNetworkIssueDetector
Detects issues with inbound network connection.
```js
const exampleIssue = {
    type: 'network',
    reason: 'inbound-network-quality' | 'inbound-network-media-latency' | 'network-media-sync-failure',
    iceCandidate: 'ice-candidate-id',
    statsSample: {
      rtt: 1234,
      packetLossPct: 1234,
      avgJitter: 1234,
      avgJitterBufferDelay: 1234,
    },
}
```

Also can detect server side issues if there is high RTT and jitter is ok.
```js
const exampleIssue = {
    type: 'server',
    reason: 'server-issue',
    iceCandidate: 'ice-candidate-id',
      statsSample: {
        rtt: 1234,
        packetLossPct: 1234,
        avgJitter: 1234,
        avgJitterBufferDelay: 1234,
      },
}
```

### NetworkMediaSyncIssueDetector
Detects issues with audio synchronization.
```js
const exampleIssue = {
    type: 'network',
    reason: 'network-media-sync-failure',
    ssrc: 1234,
    statsSample: {
      correctedSamplesPct: 15,
    },
}
```

### OutboundNetworkIssueDetector
Detects issues with outbound network connection.
```js
const exampleIssue = {
    type: 'network',
    reason: 'outbound-network-quality' | 'outbound-network-media-latency',
    iceCandidate: 'ice-candidate-id',
    statsSample: {
      rtt: 1234,
      avgJitter: 1234,
      packetLossPct: 1234,
    },
}
```

### QualityLimitationsIssueDetector
Detects issues with encoder and outbound network. Based on native qualityLimitationReason.
```js
const exampleIssue = {
    type: 'cpu',
    reason: 'encoder-cpu-throttling',
    ssrc: 1234,
    statsSample: {
      qualityLimitationReason: 'cpu',
    },
}
```

```js
const exampleIssue = {
    type: 'network',
    reason: 'outbound-network-throughput',
    ssrc: 1234,
    statsSample: {
      qualityLimitationReason: 'bandwidth',
    },
}
```

### VideoCodecMismatchDetector
Detects issues with decoding stream.
```js
const exampleIssue = {
    type: 'stream',
    reason: 'unknown-video-decoder',
    ssrc: 1234,
    trackIdentifier: 'some-track-id',
    statsSample: {
      mimeType: 'video/vp9',
      decoderImplementation: 'unknown'
    },
}
```


### MissingStreamDataDetector
Detects issues with missing data in active inbound streams
```ts
const exampleIssue = {
    type: 'stream',
    reason: 'missing-video-stream-data' | 'missing-audio-stream-data',
    trackIdentifier: 'some-track-id',
    statsSample: {
        bytesReceivedDelta: 0, // always zero if issue detected
        bytesReceived: 2392384,
        trackDetached: false,
        trackEnded: false,
    },
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
