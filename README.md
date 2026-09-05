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
  MissingStreamDataDetector
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
    new MissingStreamDataDetector(),
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
Detects a saturated local video decoder, per peer connection. Fires when more than
`frameShortfallPctThreshold` (default `10`) percent of the received video frames were not decoded on
this device, more than `affectedStreamsPercentThreshold` (default `30`) percent of the inbound
video streams show such a shortfall of their own, the inbound streams together demand more than
`decodeDemandThreshold` (default `0.7`, share of wall clock) of decoder time, and at least one of
the affected streams needs more than `affectedStreamDemandThreshold` (default `0.3`) on its own.
The summed threshold is a load proxy: browsers decode streams on separate threads, so many cheap
streams can reach it on an idle machine, which is why the per-stream condition exists. Streams with
more than `maxPacketLossPct` (default `2`) percent packet loss, with mean RTP jitter above
`maxJitterMs` (default `30`), decoded in hardware (`powerEfficientDecoder: true`), or with no
decoded frames in the window are ignored. Frames dropped after decoding do not count. Browsers drop
a frame before decoding only when a later frame can be decoded without it, so this detector covers
streams with temporal layers (simulcast or SVC, the normal case through an SFU) and stays silent on
single-layer streams such as peer-to-peer VP8 without simulcast or H.264, where an overloaded
receiver decodes every frame late instead. The detector needs a history window of at least
`minWindowMs` (default `15000`). The default storage keeps 5 previous samples, so the window spans
at most 5 poll intervals; if you poll faster than every 3 seconds, raise `maxParsedStatsStorageSize`
on this detector so the window can reach that span. It reads `id`,
`timestamp`, `framesReceived`, `framesDecoded`, `totalDecodeTime`, `packetsReceived`,
`packetsLost`, and `jitter` from the inbound video stats and stays silent on a browser that omits
any of them. Firefox reports all of them but not `powerEfficientDecoder`, so the hardware-decode
exclusion does not apply there and a Firefox receiver that decodes in hardware can reach the demand
thresholds on pipeline latency alone. A remote sender that lowers its frame rate does not trigger
this issue.
`volatilityThreshold` is accepted but has no effect since the frame rate volatility signal was
removed.
```js
const exampleIssue = {
    type: 'cpu',
    reason: 'decoder-cpu-throttling',
    statsSample: {
      decodeDemand: 1.8,           // sum over evaluated streams, 1 = one full second of decode per second
      frameShortfallPct: 40,       // received frames not decoded locally, percent
      windowMs: 20000,
      affectedStreamsPercent: 100, // percent of inbound video streams with their own shortfall
      evaluatedStreams: [ /* one entry per evaluated stream, same shape as below */ ],
      throttledStreams: [          // only the streams with their own shortfall
        {
          ssrc: 123, decodeDemand: 0.6, avgDecodeTimeMs: 20, arrivalFps: 30, decodedFps: 18,
          shortfallPct: 40, packetLossPct: 0, jitterMs: 5,
          allFps: [18, 18, 18, 18], volatility: 0, // deprecated, informational only
        },
      ],
      throtthedStreams: [ /* deprecated misspelled alias of throttledStreams, removed in the next major */ ],
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

### UnknownVideoDecoderImplementationDetector
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
