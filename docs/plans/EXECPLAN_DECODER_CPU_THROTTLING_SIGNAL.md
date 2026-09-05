# Make `decoder-cpu-throttling` measure the local decoder, not the sender

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.
This document is maintained in accordance with the `execplan` skill.

## Purpose / Big Picture

`webrtc-issue-detector` is a browser library. An application gives it one or more
`RTCPeerConnection` objects. Every few seconds the library reads the WebRTC statistics of each
connection, runs a set of detectors over them, and emits issues such as "bad inbound network" or
"encoder CPU throttling". The application shows those issues to the user or sends them to a
monitoring backend.

One of the detectors, `VideoDecoderIssueDetector`, emits the issue `decoder-cpu-throttling`. Its
intended meaning is: the device that runs this code cannot decode the incoming video fast enough.
Today the detector does not measure that. It measures how much the frame rate of each incoming
video stream wobbles over the last five samples. A remote participant whose encoder gives up frame
rate because of a bad uplink or a slow CPU produces exactly that wobble on every receiver. Every
receiver then reports `decoder-cpu-throttling` about its own device, which is wrong. In a call with
three publishers, one wobbling sender is 33 percent of the inbound streams, which is above the
default 30 percent threshold, so one struggling participant is enough to blame every other device.

After this change, `decoder-cpu-throttling` fires only when four things hold at once for the
streams of one peer connection: frames that arrived on this device were not decoded; enough of the
inbound streams show that shortfall; the incoming video together demands a large share of the wall
clock from the decode pipeline; and at least one of the streams with a shortfall is itself costly
to decode. Streams with packet loss, with high network jitter, decoded by hardware, without the
counters needed to judge them, or with no decoded frames at all are excluded. A sender that simply
sends fewer frames produces no shortfall and is no longer reported. Frames that were decoded and
then dropped by the renderer do not count. A track that the browser chooses not to decode because
nothing displays it does not count either.

One limitation is accepted and documented. The browser drops a frame before decoding only when a
later frame can be decoded without it, which needs temporal layers (simulcast or SVC, the normal
case through a selective forwarding unit). On a single-layer stream, such as peer-to-peer VP8
without simulcast or H.264, an overloaded receiver decodes every frame late instead of dropping
any, so no shortfall appears and this detector stays silent. The README says so.

A user of the library can see the result in two ways. First, the new spec
`test/detectors/VideoDecoderIssueDetector.spec.ts` contains a scenario "does not report a sender
whose frame rate wobbles" that fails on the current code and passes after. Second, in a real call
through an SFU with simulcast, a participant who throttles their own uplink no longer causes
`decoder-cpu-throttling` on the other participants' consoles, while a participant who overloads
their own CPU still gets the issue on their own device.

## Progress

- [x] (2026-09-04 07:00Z) Research: read detector, base class, helpers, parser, types, README,
  existing spec conventions, release config, CI workflows. Baseline observed: 36 tests pass, lint
  clean.
- [x] (2026-09-04 07:40Z) Codex adversarial review, round 1. Four findings, all accepted: minimum
  window duration, stalled-stream handling, per-stream packet-loss guard, legacy payload preserved
  and minor release instead of patch.
- [x] (2026-09-04 08:10Z) Codex adversarial review, round 2. Three findings, all accepted: missing
  packet counters make a stream non-evaluable, counter monotonicity across adjacent samples,
  `affectedStreamsPercentThreshold` stays effective. User chose a minor release over a major.
- [x] (2026-09-04 08:40Z) Codex adversarial review, round 3. Two findings. Accepted: shortfall no
  longer uses `framesDropped`; `affectedStreamsPercent` keeps its all-inbound denominator; the
  legacy `throtthedStreams` array carries only affected streams and the full breakdown moves to a
  new `evaluatedStreams` field. Declined by the user: switching to a major release over the
  `volatilityThreshold` no-op.
- [x] (2026-09-04 09:20Z) Independent review by a separate Claude agent, round 1. One high and four
  medium findings, all accepted: the stalled-stream clause from Codex round 1 is reverted because
  Chrome does not decode tracks that have no sink; `packetsLost` leaves the monotonic set; the
  summed demand gets a per-stream corroboration rule; test 17 is corrected; the per-connection
  scope is stated. Low findings folded in.
- [x] (2026-09-04 10:10Z) Independent review by a separate Claude agent, round 2, against libwebrtc
  source. Two high findings: single-layer streams never show a shortfall (documented as a
  limitation, no new signal added, user decision); network late-arrival and hardware decode can
  satisfy the rule (hardware-decoded streams skipped, jitter gate added). Three medium and eight
  low findings folded in. See revision note 5.
- [x] (2026-09-04 10:25Z) Milestone 1: spec harness and the failing reproduction test. Branch
  `execplan-decoder-cpu-throttling-signal` created from `origin/master` at `c21f383`. Against the
  committed detector the wobble test fails at the sixth call, exactly as predicted (see Artifacts).
- [x] (2026-09-04 10:45Z) Milestone 2: detector rework, `powerEfficientDecoder` type field, 22 tests.
  `npx -y -p node@24 -c 'npm test'` reports `58 passing`, `0 failing` on the first run.
- [x] (2026-09-04 10:50Z) Milestone 3, local part: README section replaced, `npm run lint` and
  `npm run lint:tests` clean, plan and code committed on the branch.
- [x] (2026-09-04 11:10Z) Independent Codex review of the diff `c21f383..HEAD`. Two findings: an
  absolute local path in Concrete Steps exposed an account name (accepted, removed); the 3 second
  poll guidance was called wrong (refuted, see Decision Log; wording clarified).
- [x] (2026-09-04 11:30Z) Push and pull request, on the user's approval. Upstream refused the push
  (no write access), so the branch went to the fork `jenspalmqvist/webrtc-issue-detector` (git
  remote `fork`) and the pull request was opened from there against upstream `master`:
  https://github.com/VLprojects/webrtc-issue-detector/pull/49, closing upstream issue #48 (the
  user's bug report). Remaining: the optional manual check in Validation, and the upstream review.
- [x] (2026-09-04 13:40Z) Browser validation in a consumer's local video stack (the web app's
  development container, its signalling backend, a mediasoup SFU on the host with simulcast),
  with this branch's build copied into the web app's container. Seven runs, results in Artifacts
  and Notes. Passed: healthy call silent on Chrome and
  Firefox; one sender capped to 300 kbit/s gives the receivers a 3 to 9 fps wobble and nobody
  reports; a receiver whose stats show a 40 percent shortfall at 33 ms per frame reports alone, on
  Chrome and on Firefox; leave and rejoin resets the history; machine-wide CPU overload fires the
  other detectors and not this one. Remaining: a real single-client decoder shortfall (needs a
  slow machine), the hardware-decode path in a browser, Safari, and the upstream review.
- [x] (2026-09-04 14:05Z) README: the Firefox `powerEfficientDecoder` limitation added to the
  `### VideoDecoderIssueDetector` section, next to the required-fields sentence. Plan and README
  pushed to the fork branch behind pull request #49 on the user's instruction.

## Surprises & Discoveries

- Observation: the README example for this detector shows `allDecodeTimePerFrame`, a field the
  code never emitted. The code emits `allFps`.
  Evidence: `README.md` lines 109 to 122 versus `src/detectors/VideoDecoderIssueDetector.ts` line 97.
  Commit `d6b7dcf` (January 2025, a `feat:` minor) introduced both the volatility detector with
  `allFps` and the README example with `allDecodeTimePerFrame`, so the README was wrong from the
  start. The same commit deleted `FramesDroppedIssueDetector` and its payload
  (`deltaFramesDropped`, `framesDroppedPct`, `ssrc`) as a minor, which is the precedent for this
  plan's release decision.
- Observation: the current detector fires earliest at the sixth sample, not the fifth. It requires
  a window of at least 5 entries, then collects `framesPerSecond` from every entry except the
  newest, then requires at least 5 collected values. That needs 6 entries.
  Evidence: `src/detectors/VideoDecoderIssueDetector.ts` lines 64, 74, and 84.
- Observation: the test runner does not start on the Node version installed on this machine
  (v26.8.1). Mocha's dependency `yargs` ships an extensionless CommonJS entry file that Node 26
  treats as an ES module.
  Evidence: `npm test` prints `ReferenceError: require is not defined in ES module scope` from
  `node_modules/yargs/yargs:3`. CI uses Node 24 (`.github/workflows/pr-code-checker.yml` line 17).
  Running through `npx -y -p node@24 -c 'npm test'` works and reports `36 passing`.
- Observation: the project has a `yarn.lock` and no `package-lock.json`. `npm install` fails with a
  peer dependency conflict between `eslint-config-airbnb-typescript@14.0.2` and
  `@typescript-eslint/eslint-plugin@^5`. Yarn is not installed on this machine.
  Evidence: `npx -y yarn@1.22.22 install --frozen-lockfile --ignore-engines` installs cleanly with
  two peer warnings.
- Observation: the existing guards in the detector cannot catch the sender-side case.
  Evidence: the bad-network guard reads only the receiver's own inbound network score. The DTX guard
  in `src/helpers/streams.ts` needs the standard deviation of the average frame interval to exceed
  30 ms; a sender alternating between 30 and 15 frames per second gives intervals of 33 ms and
  67 ms, a deviation of about 16 ms. The same series gives a volatility of 30 percent, above the
  default threshold of 8.
- Observation: the inbound network score cannot protect the detector from loss or jitter on one
  stream. The calculator sums `packetsLost` over every inbound audio and video stream and divides by
  the connection-level `packetsReceived`, so loss on one video stream among several is diluted. The
  guard only suppresses at a score of 2.1 or below, which needs about 21 percent connection-wide
  loss with no latency, about 635 ms of round-trip time, or about 300 ms of average jitter. Realistic
  jitter never reaches it, so the guard is close to inert. Found by the Codex and Claude reviews.
  Evidence: `src/NetworkScoresCalculator.ts`, methods `calculateInboundScore` and `calculateMOS`.
- Observation: the history window is small and its duration depends on configuration.
  `MAX_PARSED_STATS_STORAGE_SIZE` is 5, so a detector sees at most 5 previous samples plus the
  current one. The poll interval `getStatsInterval` defaults to 5000 ms but is public and
  configurable, so five samples can span anything from half a second to minutes. Found by the Codex
  review.
  Evidence: `src/utils/constants.ts`, `src/WebRTCIssueDetector.ts` line 82,
  `src/detectors/BaseIssueDetector.ts` (the `maxParsedStatsStorageSize` parameter).
- Observation: a fixture whose cumulative counters start at zero cannot reproduce a counter reset,
  because after a reset the counters regrow past zero within one interval and the endpoint deltas
  stay positive. Found while planning the reset tests after the second Codex review.
  Consequence: the fixture builder starts every cumulative counter at a non-zero baseline.
- Observation: the current detector's `throtthedStreams` array holds only the streams that met its
  condition, not every inbound stream. A consumer may use it to mark specific streams as bad. Found
  by the third Codex review.
  Evidence: `src/detectors/VideoDecoderIssueDetector.ts` lines 96 to 103 (the `.filter`).
- Observation: Chrome does not decode a remote video track that has no sink (no video element,
  canvas, or frame callback attached). Frame assembly still runs, so `framesReceived` grows while
  `framesDecoded` stays flat. A gallery that only mounts visible tiles, a lobby that holds tracks
  unattached, or a screen share shown on click all produce this pattern on a healthy device. Found
  by the first independent Claude review, which cites a statement by a Chrome WebRTC engineer in the
  W3C webrtc-pc issue 2240 thread. Not reproduced in a browser in this session.
  Consequence: a stream with zero decoded frames carries no decode evidence and is skipped, and a
  partially unrendered stream is handled by the per-stream corroboration rule.
- Observation: `packetsLost` is not a monotonic counter. The stats specification types it as
  signed and libwebrtc decrements it when a late or retransmitted packet fills a gap, so consecutive
  samples can show a decrease on a link with reordering or NACK recovery. Found by the first
  independent Claude review.
  Consequence: `packetsLost` is excluded from the monotonic check and its delta is clamped at zero.
- Observation: Chrome decodes each receive stream on its own decode thread. A sum of per-stream
  decode demand therefore grows with the participant count on an idle multi-core machine; twelve
  thumbnails at 2 ms per frame and 30 fps already sum to 0.72. Found by the first independent
  Claude review.
  Consequence: the summed threshold is a load proxy, not a saturation point, and the fire rule
  needs a per-stream corroboration on the affected streams.
- Observation: libwebrtc drops a frame before decoding only when a later temporal unit is
  decodable without it. In `video/frame_decode_timing.cc` a late frame is fast-forwarded only when
  it is more than 5 ms late and the next decodable temporal unit differs from the last decodable
  one; in `api/video/frame_buffer.cc` a unit is decodable only when every reference is already
  decoded or lies in the same unit. On a plain reference chain (each frame references the previous
  one) the next and the last decodable unit are always the same frame, so nothing is ever dropped
  before decode: an overloaded receiver decodes every frame late and `framesDecoded` keeps up with
  `framesReceived`. Pre-decode drops need temporal layers, where base-layer frames do not reference
  higher-layer frames; libwebrtc simulcast VP8 uses three temporal layers, and SVC VP9 and AV1
  behave the same way. Found by the second independent Claude review, from a read of libwebrtc
  main. Not reproduced in a browser in this session.
  Consequence: the shortfall signal covers streams with temporal layers or SVC and is silent on
  single-layer streams. The plan documents this instead of adding a second signal (see Decision
  Log).
- Observation: packet loss does not create a `received - decoded` shortfall in current Chrome.
  `video/video_stream_buffer_controller.cc` reports a complete frame to the statistics only when
  the frame is continuous, that is, all its references are decoded or continuous. Frames stuck
  behind a lost reference are never counted in `framesReceived`; when the next keyframe arrives they
  are erased and counted in `framesDropped`. The network path that does create a shortfall is late
  arrival: after a delay burst (a Wi-Fi stall, congestion) a run of frames is past its render time
  and, on a temporal-layer stream, the higher-layer frames are fast-forwarded with zero packets
  lost. Ten 400 ms stalls in a 20 second window drop on the order of 60 to 90 of 600 frames, above
  10 percent. Found by the second independent Claude review.
  Consequence: the per-stream loss gate stays as a belt-and-braces guard, and a per-stream RTP
  jitter gate is added, because RTP interarrival jitter rises with bursty delay and is not inflated
  by decoder starvation, unlike `jitterBufferDelay` and `freezeCount`.
- Observation: Chrome measures `totalDecodeTime` as the wall-clock time from the decode call to the
  decoded callback (`video/receive_statistics_proxy.cc`). For the asynchronous hardware path that
  includes the GPU-process round trip and the pipeline depth, so a hardware-decoded stream can show
  10 ms per frame with no CPU cost; 1080p VP9 or AV1 software decode also sits at 8 to 15 ms per
  frame. Chrome reports `powerEfficientDecoder: true` for hardware decoders, but only while a
  capture device is active; Firefox and WebKit do not declare the field. Found by the second
  independent Claude review.
  Consequence: streams with `powerEfficientDecoder === true` are skipped; an undefined value is
  treated as unknown and the stream is evaluated.
- Observation: `0.6 + 0.6 + 0.6` is `1.7999999999999998` in JavaScript. A `deep.eq` against `1.8`
  fails unless the total is rounded. Found by the second independent Claude review by simulation.
  Consequence: the totals in the payload are rounded explicitly, not only the per-stream entries.
- Observation: an acceptance check that reverts the detector file and re-runs the new spec cannot
  work, because the spec constructs the detector with new parameters and ts-node type-checks;
  against the old interface the spec fails to compile and mocha reports a load error, not a named
  failing test. Found by the second independent Claude review.
  Consequence: the "fails before" evidence is the Milestone 1 checkpoint, where only the wobble
  test exists.
- Observation: the repository's airbnb eslint configuration bans `for...of` and `for...in`
  statements (`no-restricted-syntax`). Found by the second independent Claude review with
  `eslint --print-config`.
  Consequence: the detector uses index loops or array methods such as `every` and `some`.
- Observation: through a mediasoup SFU every receiver holds an extra inbound video
  stream with ssrc 1234 that never receives a frame. It is mediasoup's bandwidth probe. The
  detector never evaluates it (`deltaReceived` stays 0), but `affectedStreamsPercent` divides by
  `data.video.inbound.length`, which counts it. Found in the local browser runs of 2026-09-04.
  Evidence: two affected streams out of two real ones reported `affectedStreamsPercent: 66.667`.
  Consequence: the ratio reads low by one stream on every mediasoup receiver. It cannot create a
  false positive. It can hide a true one when only one real stream is received, because 1 of 2 is
  50 percent, above the 30 percent default, but 1 of 3 real streams plus the probe is 25 percent.
  Left as a follow-up; see the Decision Log.
- Observation: Firefox 146 exposes every field the detector reads (`totalDecodeTime`,
  `framesDecoded`, `framesReceived`, `packetsReceived`, `packetsLost`, `jitter`,
  `framesPerSecond`) but neither `powerEfficientDecoder` nor `decoderImplementation`. Found in
  the local browser runs of 2026-09-04 with Playwright's Firefox build.
  Evidence: the inbound-rtp report keys captured from `RTCRtpReceiver.getStats()` on Firefox.
  Consequence: the hardware-decode skip never applies on Firefox. A Firefox user with hardware
  decoding can reach the demand gates on pipeline latency alone. Documented as a limitation; see
  the Decision Log.
- Observation: Chrome DevTools CPU throttling and a Web Worker CPU burner do not starve the video
  decoder on an Apple silicon machine. Throttling slows the page's main thread only; the burner
  saturates every core, so every participant's encoder starves and the SFU loses its RabbitMQ
  connection before any receiver shows a decode shortfall.
  Evidence: under twenty spinning workers on ten cores, the burner's own receiver decoded 480p VP8
  at 0.5 ms per frame with under 1 percent frames dropped, while every participant reported
  `encoder-cpu-throttling` and `frozen-video-track` and the burner reported 13 percent inbound
  packet loss.
  Consequence: the positive path was validated with a `getStats` shim on one receiver (see the
  Decision Log), and the real single-client reproduction still needs a slow machine.

## Decision Log

- Decision: replace the frame rate volatility signal completely as a detection input. Do not keep
  it as a secondary condition.
  Rationale: the volatility of the decoded frame rate cannot separate a sender that sends fewer
  frames from a receiver that decodes fewer frames. Any rule that keeps it keeps the false positive.
  Date/Author: 2026-09-04, plan author.
- Decision: fire when all four hold: `frameShortfallPct > 10`; `affectedStreamsPercent > 30`, where
  affected means the stream's own shortfall exceeds the same 10 percent and the denominator is every
  inbound video stream in the current sample; `decodeDemand > 0.7` as the sum over evaluated
  streams; and at least one affected stream has its own `decodeDemand > 0.3`. All four thresholds
  are constructor parameters. The comparisons use the unrounded values; rounding is for the payload.
  Rationale: decode demand alone fires on a fast machine that decodes many streams comfortably and
  in large calls where the stream count alone reaches the sum. Frame shortfall alone fires on frames
  a delay burst made late or on a tile that was unmounted for part of the window. The per-stream
  corroboration ties the verdict to the streams that show the problem: under real CPU contention
  the decode time per frame of those streams inflates, and a stream that is short of frames while
  decoding each one cheaply is not the decoder's problem. The affected streams gate keeps the
  existing public parameter `affectedStreamsPercentThreshold` effective, with its old denominator
  and a meaning close to its old one, so a caller who raised it to suppress alerts keeps that
  effect. The default 0.7 is the point where a single software decode pipeline is close to
  saturation and is documented as a load proxy. The default 0.3 per stream is 10 ms per frame at 30
  fps, above a healthy software decode of a 720p stream; a hardware decoder or a 1080p software
  decode can reach it on a healthy machine, which is why hardware-decoded streams are skipped and a
  jitter gate removes the late-arrival network case. The default 10 percent shortfall is well above
  the noise of a few frames waiting in the jitter buffer at the window edges.
  Date/Author: 2026-09-04, plan author; affected streams gate after Codex round 2, denominator
  restored after round 3, per-stream corroboration after Claude review 1, calibration caveat after
  Claude review 2.
- Decision: accept that single-layer streams are not covered, document it, and do not add a second
  fire path based on decode duty cycle.
  Rationale: on a single-layer stream the browser never drops before decode (see Surprises), so the
  shortfall signal cannot fire there. The alternative, firing a software-decoded stream whose own
  decode demand is close to 1.0, needs a reliable hardware flag to avoid firing on hardware
  pipeline latency, and `powerEfficientDecoder` is absent on Firefox and Safari and absent in Chrome
  without an active capture device; it also needs a threshold with no field data behind it. This
  change exists to remove a false positive, so it must not add a new one. The covered case, temporal
  layers through an SFU, is the normal deployment of this library. A duty-cycle signal can be a
  follow-up under its own issue reason once field data exists.
  Date/Author: 2026-09-04, user decision after Claude review 2.
- Decision: skip a stream that decoded no frames over the window. Do not treat it as evidence.
  Rationale: Codex round 1 asked for a "stalled stream" clause that let such a stream satisfy the
  demand side of the rule on its own. The first Claude review showed that Chrome produces exactly
  this pattern on a healthy device whenever a received track has no sink, which is a common UI
  pattern, so the clause was a certain false positive. A stream with zero decoded frames carries no
  decode-time evidence; it also covers decoder initialisation failures and unsupported codec
  profiles, which are not CPU throttling. If a stall signal is wanted later, it belongs under a
  separate issue reason.
  Date/Author: 2026-09-04, plan author, reverting the Codex round 1 clause after Claude review 1.
- Decision: skip a stream whose newest sample has `powerEfficientDecoder === true`. Evaluate the
  stream when the field is absent.
  Rationale: Chrome sets the field from its hardware-acceleration flag. Hardware decode time as
  reported includes pipeline latency and says nothing about CPU load, so such a stream can reach the
  per-stream floor on a healthy machine. Absent means unknown (Firefox, Safari, Chrome without
  capture), and an unknown stream is still evaluated because skipping it would silence the detector
  on those browsers entirely. The field is added to `ParsedInboundVideoStreamStats` as optional.
  Date/Author: 2026-09-04, plan author, after Claude review 2.
- Decision: exclude a stream whose mean RTP `jitter` over the window exceeds `maxJitterMs`
  (default 30 ms). `jitter` is required in every sample, like the packet counters.
  Rationale: a delay burst makes a run of frames late; on a temporal-layer stream the browser then
  fast-forwards higher-layer frames with zero packets lost, which is a local shortfall caused by the
  network. RTP interarrival jitter rises with bursty delay and is not inflated when the decoder
  starves, so it separates the two. `jitterBufferDelay` and `freezeCount` rise in both cases and
  cannot. 30 ms is well above the few milliseconds of a healthy link and below the level of a
  stalling one. Firefox and WebKit declare `jitter` on inbound RTP, so requiring it costs no
  browser.
  Date/Author: 2026-09-04, plan author, after Claude review 2.
- Decision: compute decode demand as `(decode time per decoded frame) * (received frames per
  second)`, not as `decode time / wall time`.
  Rationale: when frames are dropped before decode they spend no decode time, so raw duty cycle
  falls as the problem grows. Multiplying the per-frame cost by the arrival rate measures the demand
  the stream would place on the decoder if every frame were decoded.
  Date/Author: 2026-09-04, plan author.
- Decision: sum decode demand across all evaluated inbound video streams of the connection and
  threshold the sum, with the per-stream corroboration above.
  Rationale: the sum catches many moderately costly streams that no single-stream threshold sees.
  It is not a saturation measure, because Chrome decodes streams on separate threads, so it is
  paired with the per-stream rule. The sum, like everything in this detector, is per peer
  connection: history and evaluation are keyed by `data.connection.id`. In a mesh call, or an SFU
  design with one connection per subscription, each connection has one inbound stream and the
  detector judges that one stream. Aggregation across connections is out of scope.
  Date/Author: 2026-09-04, plan author; scope stated after Claude review 1.
- Decision: compute frame shortfall per stream as `max(received - decoded, 0)` over the window,
  then divide the sum over streams by the sum of received frames. Do not read `framesDropped`.
  Rationale: a frame the decoder never decoded is missing from `framesDecoded`, so "received minus
  decoded" counts every pre-decode drop of a counted frame. `framesDropped` counts frames dropped
  before decode and frames dropped after decode because they missed their display deadline; the
  second kind is a renderer problem, and the counter cannot separate the two. The shortfall is a
  lower bound: Chrome counts a received frame at most once per inserted frame even when one
  recovered packet makes several frames continuous, so `framesReceived` can undercount; that errs
  toward silence. A few frames sitting in the jitter buffer at the window edges inflate the
  difference by a constant that the 10 percent threshold absorbs.
  Date/Author: 2026-09-04, plan author, `framesDropped` removed after Codex round 3, lower-bound
  note after Claude review 2.
- Decision: exclude a stream from evaluation when its packet loss over the window exceeds
  `maxPacketLossPct` (default 2 percent), computed as `lost / (lost + received) * 100` from the
  stream's own `packetsLost` and `packetsReceived`, with the lost delta clamped at zero. Keep the
  existing connection-level bad-network guard unchanged.
  Rationale: this is a belt-and-braces guard. In current Chrome, frames behind a lost reference are
  not counted as received, so loss by itself does not create a shortfall (see Surprises); the real
  network path is late arrival, which the jitter gate handles. The loss gate stays because it is
  cheap, because other browsers may count differently, and because heavy loss makes every other
  number on the stream unreliable. The connection-level guard stays for continuity with the current
  code; it rarely triggers.
  Date/Author: 2026-09-04, plan author, after Codex round 1; clamp after Claude review 1; rationale
  corrected after Claude review 2.
- Decision: treat `id`, `timestamp`, `totalDecodeTime`, `framesDecoded`, `framesReceived`,
  `packetsReceived`, `packetsLost`, and `jitter` as required; skip the stream when any of them is
  missing in any sample of the window. Say in the README that a browser which omits any of them
  keeps this detector silent.
  Rationale: without the packet counters and jitter the network gates cannot run, and the plan
  promises that a reported shortfall is local. The other fields are the signal itself. The current
  detector needs only `framesPerSecond`, so this is a support regression on browsers that omit any
  of the fields; silence there is the accepted trade-off. Firefox and WebKit declare all of them on
  inbound RTP stats (their IDL was checked by Claude review 2; runtime population was not), so the
  clause is expected to trigger rarely.
  Date/Author: 2026-09-04, plan author; packet counters after Codex round 2; support note after
  Claude review 1; jitter after Claude review 2.
- Decision: require the window to span at least `minWindowMs` (default 15000 ms) between its
  oldest and newest sample, in addition to at least 5 samples.
  Rationale: the poll interval is configurable. Five samples at 100 ms are half a second, and a
  half-second burst is not CPU throttling. At the default 5000 ms interval five samples span 20
  seconds, so the default behaviour evaluates at the fifth sample, one poll earlier than the
  current code. The default storage holds 5 previous samples, so the window spans at most 5
  intervals; an application that polls faster than every 3 seconds must raise
  `maxParsedStatsStorageSize` on this detector so the window can reach 15 seconds; the README says
  so.
  Date/Author: 2026-09-04, plan author, after Codex round 1.
- Decision: compute the deltas from the oldest and the newest sample, but first require that the
  stream is continuous across the whole window: the same `id` in every sample, and each of
  `timestamp`, `totalDecodeTime`, `framesDecoded`, `framesReceived`, `packetsReceived`
  non-decreasing between each pair of adjacent samples. `packetsLost` and `jitter` are not in that
  set. Skip the stream otherwise.
  Rationale: the counters are cumulative, so the endpoint difference equals the sum of the
  per-interval deltas only when no reset happened in between. A stream that resets mid-window and
  regrows past its old values shows positive endpoint deltas that mix two counter lifetimes, and an
  endpoint-only check misses it. The `id` check is cheap and catches a stream the browser recreated
  under a new stats object; in Chrome the id is derived from the SSRC and most likely survives a
  recreation, so the adjacent-counter check is the one that does the work there. `packetsLost` can
  legitimately decrease and `jitter` is a gauge, not a counter.
  Date/Author: 2026-09-04, plan author, after Codex round 2; `packetsLost` excluded and the `id`
  rationale corrected after Claude review 1.
- Decision: require at least 10 received frames per stream over the window.
  Rationale: a stream at one frame per second over 20 seconds gives 20 frames. Below 10 frames the
  ratios are dominated by single frames and are noise. The minimum window duration, not this count,
  is what stops short bursts.
  Date/Author: 2026-09-04, plan author.
- Decision: remove the spatial-layer guard and the DTX guard from this detector.
  Rationale: both guards existed to explain frame rate wobble, which is no longer the signal. A
  spatial-layer switch changes the real decode cost and must count as demand.
  `FrozenVideoTrackDetector` still uses both helpers, so the helpers stay.
  Date/Author: 2026-09-04, plan author.
- Decision: keep every legacy payload field with its old shape and its old selection rule, and add
  the new fields next to them. `affectedStreamsPercent` is the percent of all inbound video streams
  whose own shortfall exceeds `frameShortfallPctThreshold`, the same denominator as today; paused
  or dead streams in a large SFU call dilute it exactly as they dilute the current value.
  `throtthedStreams` holds only the affected streams, as today it holds only the streams that met
  the condition; `throttledStreams` is the correctly spelled name for the same array reference. Each
  entry keeps `allFps` and `volatility`, computed as today from `framesPerSecond`, as informational
  fields, next to the new per-stream numbers. A new field `evaluatedStreams` holds one entry of the
  same shape for every evaluated stream, so the demand breakdown across healthy streams is still
  visible. The misspelled key and the per-stream `allFps` and `volatility` are documented as
  deprecated, to be removed in the next major release.
  Rationale: Codex round 1 showed that removing `affectedStreamsPercent` and `allFps` breaks
  consumers at runtime even though TypeScript does not see it, because `statsSample` is typed as
  `Record<string, unknown>`. Codex round 3 showed that filling the legacy array with every
  evaluated stream would make a consumer mark healthy streams as throttled. Keeping the old
  selection rule and adding a separate field for the breakdown preserves both uses. Three small
  deltas remain and are named in the commit body: the earliest emission moves from the sixth to the
  fifth poll, `affectedStreamsPercent` is now rounded to three decimals, and `allFps` holds one
  value per stored previous sample (4 at the default storage size) instead of exactly 5.
  Date/Author: 2026-09-04, plan author, after Codex rounds 1 and 3; deltas listed after Claude
  review 2.
- Decision: keep `affectedStreamsPercentThreshold` as an effective parameter with default 30 (see
  the fire rule). Keep `volatilityThreshold` in the params interface, marked `@deprecated`,
  accepted and ignored, and say so in the commit body and the README.
  Rationale: Codex round 2 showed that a caller who set `affectedStreamsPercentThreshold` to 100 to
  silence the detector would get alerts again if the parameter became a no-op. Giving it a
  compatible meaning preserves that. `volatilityThreshold` has no compatible meaning, because the
  wobble it measured is exactly what this change stops treating as a signal; a caller who set it
  very high to silence the detector will see alerts again. The user chose, in Codex rounds 2 and 3,
  to accept that under a minor release rather than ship a major, because the normal way to silence
  a detector is to leave it out of the `detectors` list, and because a major would force every
  consumer to migrate for a payload that is otherwise additive. Both Claude reviews agreed, citing
  commit `d6b7dcf`, which deleted a whole detector and its payload as a `feat:` minor.
  Date/Author: 2026-09-04, user decision after Codex rounds 2 and 3.
- Decision: round every number in the emitted `statsSample` to three decimals, including the
  totals.
  Rationale: the payload is for humans and dashboards. Rounding also lets the spec use exact deep
  equality instead of tolerances; without rounding the totals, `0.6 + 0.6 + 0.6` is not `1.8`.
  Date/Author: 2026-09-04, plan author; totals made explicit after Claude review 2.
- Decision: release as a minor with a `feat(VideoDecoderIssueDetector): ...` commit, and describe
  the deprecations, the `volatilityThreshold` behaviour change, the three compatibility deltas, and
  the single-layer limitation in the commit body.
  Rationale: the release adds payload fields and constructor parameters and deprecates others
  without removing anything, which is a minor change under semantic versioning. Codex round 1
  rejected shipping the payload change as a patch. The user confirmed minor over major after Codex
  rounds 2 and 3.
  Date/Author: 2026-09-04, user decision.
- Decision: keep the README guidance "raise the storage if you poll faster than every 3 seconds".
  Rationale: the Codex review of the diff claimed that five samples span four intervals, so a 3
  second poll would give a 12 second window and never reach `minWindowMs`. That counts the stored
  samples only. `BaseIssueDetector` keeps 5 previous samples and the detector appends the current
  one, so the window has 6 entries and 5 intervals; at 3 seconds it spans exactly 15000 ms and the
  detector evaluates from the sixth poll. The second Claude review had verified the same boundary.
  The README and the plan now state the 5-interval arithmetic so a reader does not repeat the
  miscount.
  Date/Author: 2026-09-04, plan author, after the Codex diff review.
- Decision: run tests through `npx -y -p node@24 -c 'npm test'` on this machine.
  Rationale: CI uses Node 24. The locally installed Node 26 cannot start mocha. Node 22 also works,
  but 24 matches CI.
  Date/Author: 2026-09-04, plan author.
- Decision: validate the positive path in a real call with a shim on `RTCRtpReceiver.getStats()`
  of one participant, which reports `framesDecoded` at 60 percent of `framesReceived` and
  `totalDecodeTime` at 33 ms per decoded frame, with `powerEfficientDecoder: false`. Every other
  participant keeps real stats.
  Rationale: the library calls `receiver.getStats()` and iterates the report with `forEach`, so a
  `Map` with edited inbound-rtp entries exercises the parser, the detector, the frontend's
  `onIssues` path, and the SSRC identity key exactly as a real shortfall would. The only part it
  does not exercise is the browser's decoder, which this machine cannot starve.
  Date/Author: 2026-09-04, plan author, during the browser validation.
- Decision: leave the `affectedStreamsPercent` denominator as `data.video.inbound.length` on this
  branch and record the probe-stream miscount as a follow-up.
  Rationale: the miscount lowers the ratio and cannot create a false positive, and the pull request
  is already open for review. Counting only evaluated streams is a behaviour change with its own
  test and its own review. Do it in a separate change with a fixture that holds a stream with
  zero received frames.
  Date/Author: 2026-09-04, plan author, after the browser validation.
- Decision: document that the hardware-decode skip needs `powerEfficientDecoder`, which Firefox
  does not report, and do not add a Firefox-specific rule.
  Rationale: there is no field on Firefox that tells hardware from software decoding. Any
  substitute, such as a decode-time floor, would also silence a real software decoder. The
  limitation belongs in the README next to the single-layer limitation.
  Date/Author: 2026-09-04, plan author, after the browser validation.

## Outcomes & Retrospective

Delivered on branch `execplan-decoder-cpu-throttling-signal` (base `c21f383`), not pushed:
`src/detectors/VideoDecoderIssueDetector.ts` rewritten (volatility signal gone, four-condition rule,
six skip rules, legacy payload preserved), `powerEfficientDecoder?: boolean` added to
`ParsedInboundVideoStreamStats`, `test/detectors/VideoDecoderIssueDetector.spec.ts` with a fixture
builder and 22 tests, README section replaced. Measured against the Purpose: the wobble reproduction
fails on the old code and passes on the new one, so the false positive this plan exists to remove is
gone. The true positive is covered for streams with temporal layers or SVC and not for single-layer
streams, as documented. The branch build then ran in a consumer's local video stack for seven
browser runs (see Artifacts and Notes). The false positive is gone in a real call: a sender capped
to 300 kbit/s gives every receiver the old wobble and no receiver reports. The positive path, the
per-connection history reset, and Firefox field coverage passed. Two gaps remain: the positive path
was driven by a stats shim because this machine cannot starve its decoder, and the hardware-decode
skip has only unit tests. Two follow-ups came out of the runs: mediasoup's probe stream is counted
in `affectedStreamsPercent`, and Firefox has no `powerEfficientDecoder`.

Lessons. Six review rounds on the plan made the build a single pass: the suite went green on the
first run and lint needed one indentation fix. The two rounds that read libwebrtc source found the
only model-level problems; reviews that reasoned from the stats specification alone missed them.

## Context and Orientation

The repository is `webrtc-issue-detector`, a TypeScript library published to npm from GitHub
(`VLprojects/webrtc-issue-detector`). Tests use mocha and chai and live in `test/`. Lint is eslint
with the airbnb-typescript config, a line limit of 120 characters, and a ban on `for...of` and
`for...in` loops. Releases are cut by semantic-release from commit messages on `master`: `fix:`
gives a patch, `feat:` a minor, a `BREAKING CHANGE` footer a major.

Key files:

- `src/detectors/VideoDecoderIssueDetector.ts` is the detector this plan rewrites. It is 127
  lines. Its class extends `BaseIssueDetector` and implements `performDetection(data)`.
- `src/detectors/BaseIssueDetector.ts` provides the history. `detect(data, networkScores)` calls
  `performDetection` and then stores the sample. So on the N-th call the history returned by
  `getAllLastProcessedStats(connectionId)` holds the N-1 previous samples, capped by the
  constructor parameter `maxParsedStatsStorageSize`, default `MAX_PARSED_STATS_STORAGE_SIZE = 5`
  in `src/utils/constants.ts`. `deleteLastProcessedStats` clears the history for one connection.
  A cleanup timer, reset on every `detect()` call, clears the whole history of a connection after
  35 seconds without a new sample (`src/utils/tasks.ts`). It is an idle timeout, not per-sample
  ageing. History is keyed by `data.connection.id`, so everything the detector computes is per peer
  connection.
- `src/types.ts` defines `ParsedInboundVideoStreamStats` (lines 223 to 278). The fields this plan
  uses are `id` (the browser's stats object id), `ssrc`, `timestamp` (milliseconds),
  `totalDecodeTime` (seconds, cumulative), `framesDecoded`, `framesReceived`, `packetsReceived`
  (cumulative counts), `packetsLost` (cumulative but may decrease), `jitter` (seconds, a gauge),
  and `framesPerSecond` (frames decoded in the last second, used only for the legacy fields).
  `framesDropped` exists but is not read. This plan adds `powerEfficientDecoder?: boolean` to the
  interface. The file also defines `IssueType.CPU`, `IssueReason.DecoderCPUThrottling`
  (`'decoder-cpu-throttling'`), `IssuePayload` with `statsSample?: Record<string, unknown>`,
  `MosQuality` (`BAD = 2.1`), and `WebRTCStatsParsedWithNetworkScores`, which is the parsed stats
  plus `networkScores.inbound`.
- `src/parser/RTCStatsParser.ts` lines 186 to 201 spread every field of the browser's `inbound-rtp`
  report into the parsed stream object, so all fields above, including `powerEfficientDecoder`,
  are present at runtime when the browser reports them; only the type needs the new field.
- `src/helpers/calc.ts` exports `calculateVolatility`, which the detector keeps using for the
  legacy `volatility` field. `src/helpers/streams.ts` exports `isDtxLikeBehavior` and
  `src/utils/video.ts` exports `isSvcSpatialLayerChanged`; after this change the detector imports
  neither. They stay in place because `src/detectors/FrozenVideoTrackDetector.ts` uses them.
- `src/NetworkScoresCalculator.ts` computes `networkScores.inbound`, a mean opinion score from 1 to
  5 built from connection-wide packet loss, average jitter, and round-trip time.
- `test/detectors/UnknownVideoDecoderImplementationDetector.spec.ts` is the only existing detector
  spec and sets the conventions: `faker` for ids, a local `createStatsForDetector` helper that
  builds a partial `WebRTCStatsParsed` and casts it, `describe('wid/detectors/<Name>')`, and
  `expect(...).to.deep.eq(...)` on the full result array.
- `README.md` lines 109 to 122 document this detector with a wrong example.

Terms used below. A *sample* is one parsed stats object for one connection at one poll. The
*window* is the array of the stored previous samples plus the current sample, in time order. *Decode
demand* is a dimensionless number: 1.0 means the incoming frames need one full second of decoder
time per second of wall clock. *Frame shortfall* is the count of frames that arrived on this device
and were not decoded here. An *evaluated stream* is one that passed every skip rule and contributes
to the sums. An *affected stream* is an evaluated stream whose own shortfall percent exceeds
`frameShortfallPctThreshold`. A *temporal layer* is a subset of frames a decoder can skip without
breaking the reference chain; simulcast VP8 and SVC VP9 or AV1 have them, plain single-stream VP8
and H.264 do not.

## Plan of Work

### Milestone 1: spec harness and the failing reproduction

Create `test/detectors/VideoDecoderIssueDetector.spec.ts`. Write a fixture builder
`createSamples({ connectionId, intervalMs, count, streams, baseline })` that produces a time series
of `count` parsed stats samples for one connection. `intervalMs` defaults to 5000. Sample 0 holds
the baseline counters and no interval. Interval `k` (for `k` from 1 to `count - 1`) is the time
between sample `k - 1` and sample `k`, and its per-interval values are added into sample `k` and
every later sample. So `count` samples have `count - 1` intervals, and a per-interval array has
`count - 1` entries.

Each stream description has: `ssrc`, `receivedFps` (a number, or an array with one value per
interval, to model a wobbling sender), `decodedFps` (same shape, defaults to `receivedFps`),
`droppedFps` (defaults to 0, feeds `framesDropped`, which the new detector must ignore),
`decodeMsPerFrame`, `packetLossPct` (defaults to 0), `jitterMs` (defaults to 5, feeds `jitter` in
seconds in every sample), `powerEfficientDecoder` (optional boolean; when given it is set in every
sample), `resetAtSample` (optional index; that sample holds zero for every cumulative counter,
`timestamp` excepted, and later samples grow from zero), `newIdAtSample` (optional index from which
the stream's `id` carries a different suffix), and `omit` (optional list of field names to leave out
of every sample, for the missing-field tests).

Every cumulative counter starts at a non-zero baseline in sample 0, as a real stream that existed
before the detector saw it would: `framesReceived: 1000`, `framesDecoded: 1000`, `framesDropped: 0`,
`totalDecodeTime: 10`, `packetsReceived: 2000`, `packetsLost: 0`. The optional `baseline` argument
overrides any of these. Each inbound stream object carries `id` (a string derived from the ssrc, for
example `'IT01V' + ssrc`), `ssrc`, `timestamp` (`sampleIndex * intervalMs`), `framesReceived`,
`framesDecoded`, `framesDropped`, `totalDecodeTime` (in seconds, so
`framesDecodedThisInterval * decodeMsPerFrame / 1000` accumulated), `packetsReceived` (two packets
per received frame), `packetsLost` (per interval `Math.round(packetsReceivedThisInterval *
packetLossPct / 100)`, accumulated), `jitter` (`jitterMs / 1000`), and `framesPerSecond` equal to
the decoded fps of the interval that ends at this sample (for sample 0, of interval 1).
`framesPerSecond` exercises the current code in the reproduction test and feeds the legacy `allFps`
field in the new code. Set no `frameWidth` and `frameHeight`. Build each sample as
`{ connection: { id }, video: { inbound: [...] } } as WebRTCStatsParsed`, the same cast the existing
spec uses.

Write a helper `runDetector(detector, samples, networkScoresBySample?)` that calls
`detector.detect(sample, networkScores)` for each sample in order and returns the array of result
arrays.

Write the first test, "does not report a sender whose frame rate wobbles". Three streams, six
samples. Stream A has `receivedFps: [30, 15, 30, 15, 30]`, `decodeMsPerFrame: 4`. Streams B and C
have `receivedFps: 30`, `decodeMsPerFrame: 4`. Expect every result array to be empty. On the current
code this test fails at the sixth call: the `framesPerSecond` series of stream A taken from samples
0 to 4 is `[30, 30, 15, 30, 15]`, mean 24, mean absolute deviation 7.2, volatility 30 percent, above
the threshold 8; one stream of three is 33.3 percent, above 30; the DTX guard sees frame intervals
of 33 ms and 67 ms with a standard deviation of about 16 ms, below 30, so it does not intervene.

Run the spec and confirm this one test fails with the current detector. Record the failing output
in `Outcomes & Retrospective`; this is the only point where the "fails before" evidence can be
taken, because later tests construct the detector with parameters the old interface rejects at
compile time. Do not change the detector yet.

### Milestone 2: detector rework

Add `powerEfficientDecoder?: boolean` to `ParsedInboundVideoStreamStats` in `src/types.ts`, next to
`decoderImplementation`.

Rewrite `src/detectors/VideoDecoderIssueDetector.ts` as follows. Keep the file name, the default
export, and the class name. Use index loops or `every`/`some`, not `for...of`.

The params interface becomes:

```ts
interface VideoDecoderIssueDetectorParams extends BaseIssueDetectorParams {
  /** Sum of per-stream decode demand over the connection, above which the decode load is high. 1 = whole wall clock. */
  decodeDemandThreshold?: number;          // default 0.7
  /** At least one affected stream must have its own decode demand above this. */
  affectedStreamDemandThreshold?: number;  // default 0.3
  /** Share (0..100) of received frames not decoded locally, above which the device did not keep up. */
  frameShortfallPctThreshold?: number;     // default 10
  /** Share (0..100) of inbound video streams that must show their own shortfall before an issue is emitted. */
  affectedStreamsPercentThreshold?: number; // default 30, unchanged
  /** Streams with fewer received frames in the window are ignored. */
  minFramesReceived?: number;              // default 10
  /** The window must span at least this many milliseconds before the detector evaluates. */
  minWindowMs?: number;                    // default 15000
  /** Streams whose packet loss over the window exceeds this percent are ignored. */
  maxPacketLossPct?: number;               // default 2
  /** Streams whose mean RTP jitter over the window exceeds this many milliseconds are ignored. */
  maxJitterMs?: number;                    // default 30
  minMosQuality?: number;                  // default MosQuality.BAD, unchanged
  /** @deprecated No effect. The fps volatility signal was removed; a high value no longer silences this detector. */
  volatilityThreshold?: number;
}
```

`performDetection` keeps the existing bad-network guard unchanged: if any sample in the window has
`networkScores.inbound` defined and at or below `minMosQuality`, return `[]`.

`processData` does the following. Build the window as today. If it has fewer than 5 entries, return
`[]`. Take `oldest = window[0]` and `newest = window[window.length - 1]`. For each stream in
`newest.video.inbound`:

1. Find the stream with the same `ssrc` in every window entry. Skip the stream if any entry lacks
   it.
2. Skip the stream if, in any entry, `id` is not a string, or any of `timestamp`, `totalDecodeTime`,
   `framesDecoded`, `framesReceived`, `packetsReceived`, `packetsLost`, `jitter` is not a finite
   number.
3. Skip the stream if `id` differs between any two entries, or if any of `timestamp`,
   `totalDecodeTime`, `framesDecoded`, `framesReceived`, `packetsReceived` decreases between any
   pair of adjacent entries. `packetsLost` and `jitter` are deliberately not checked.
4. Skip the stream if the newest entry has `powerEfficientDecoder === true`.
5. Compute the deltas newest minus oldest: `deltaTimeMs`, `deltaDecodeTimeSec`, `deltaDecoded`,
   `deltaReceived`, `deltaPacketsReceived`, and `deltaPacketsLost = max(newest - oldest, 0)`. Skip
   the stream if `deltaTimeMs < minWindowMs`, if `deltaReceived < minFramesReceived`, or if
   `deltaDecoded === 0`.
6. Compute `packetLossPct = deltaPacketsLost / (deltaPacketsLost + deltaPacketsReceived) * 100` (0
   when the denominator is 0) and skip the stream if it exceeds `maxPacketLossPct`.
7. Compute `jitterMs` as the mean of `jitter` over every window entry, times 1000, and skip the
   stream if it exceeds `maxJitterMs`.
8. Then:

```
deltaTimeSec          = deltaTimeMs / 1000
arrivalFps            = deltaReceived / deltaTimeSec
decodedFps            = deltaDecoded / deltaTimeSec
shortfallFrames       = max(deltaReceived - deltaDecoded, 0)
decodeTimePerFrameSec = deltaDecodeTimeSec / deltaDecoded
decodeDemand          = decodeTimePerFrameSec * arrivalFps
```

For the legacy fields, collect `allFps` exactly as the current code does: loop over every window
entry except the newest, find the stream by `ssrc`, and push its `framesPerSecond` when defined.
`volatility` is `calculateVolatility(allFps)` when `allFps` is non-empty, else 0.

Collect one entry per evaluated stream, every number rounded to three decimals:

```ts
{
  ssrc,
  decodeDemand,
  avgDecodeTimeMs: decodeTimePerFrameSec * 1000,
  arrivalFps,
  decodedFps,
  shortfallPct: shortfallFrames / deltaReceived * 100,
  packetLossPct,
  jitterMs,
  allFps,                                  // deprecated, informational
  volatility,                              // deprecated, informational
}
```

Keep the unrounded `decodeDemand`, `shortfallFrames`, and `deltaReceived` of each stream alongside
for the totals. If no stream was evaluated, return `[]`. Compute, unrounded:

```
totalDecodeDemand      = sum of decodeDemand over evaluated streams
frameShortfallPct      = sum(shortfallFrames) / sum(deltaReceived) * 100
affectedEntries        = entries whose unrounded shortfall percent > frameShortfallPctThreshold
affectedStreamsPercent = affectedEntries.length / data.video.inbound.length * 100
maxAffectedDemand      = max unrounded decodeDemand over affectedEntries (0 when none)
```

Fire when all four hold on the unrounded values: `frameShortfallPct > frameShortfallPctThreshold`,
`affectedStreamsPercent > affectedStreamsPercentThreshold`,
`totalDecodeDemand > decodeDemandThreshold`, and
`maxAffectedDemand > affectedStreamDemandThreshold`. Push one issue:

```ts
{
  type: IssueType.CPU,
  reason: IssueReason.DecoderCPUThrottling,
  statsSample: {
    decodeDemand: round3(totalDecodeDemand),
    frameShortfallPct: round3(frameShortfallPct),
    windowMs: deltaTimeMs of the first evaluated stream,
    affectedStreamsPercent: round3(affectedStreamsPercent),
    evaluatedStreams: entries,             // every evaluated stream, for the demand breakdown
    throttledStreams: affectedEntries,     // only streams with their own shortfall
    // deprecated misspelling, kept for consumers that persisted it; remove in the next major
    throtthedStreams: affectedEntries,     // same array reference as throttledStreams
  },
}
```

and call `this.deleteLastProcessedStats(data.connection.id)` as the current code does, so the issue
is not repeated on the next poll and the next verdict needs a fresh window.

For `windowMs`, use the first evaluated stream. All streams in one sample share the poll time within
a few milliseconds, and this field is informational.

Round with a small local helper `round3 = (n: number) => Math.round(n * 1000) / 1000`.

Remove the imports of `isDtxLikeBehavior` and `isSvcSpatialLayerChanged` from this file. Keep the
import of `calculateVolatility`. Keep the constant `MIN_STATS_HISTORY_LENGTH = 5`.

Complete the spec with these tests. Unless stated, each test uses the default detector, the default
5000 ms interval, six samples, and no network scores, so the window at the fifth call has 5 entries
(samples 0 to 4) and spans 20000 ms. "Healthy" means `receivedFps: 30`, `decodeMsPerFrame: 4`, no
loss, default jitter (demand 0.12 per stream, shortfall 0). "Overloaded" means `receivedFps: 30`,
`decodedFps: 18`, `droppedFps: 12`, `decodeMsPerFrame: 20`. Over 20 seconds an overloaded stream
has received 600, decoded 360, decode time 7.2 s, per-frame cost 0.02 s, arrival 30 fps, demand 0.6,
shortfall 240 frames (40 percent), `allFps` `[18, 18, 18, 18]` (samples 0 to 3), `volatility` 0,
`packetLossPct` 0, `jitterMs` 5. Call the entry with these numbers `overloadedEntry(ssrc)` in the
spec: `{ ssrc, decodeDemand: 0.6, avgDecodeTimeMs: 20, arrivalFps: 30, decodedFps: 18,
shortfallPct: 40, packetLossPct: 0, jitterMs: 5, allFps: [18, 18, 18, 18], volatility: 0 }`.
"Fires with B and C" means call 5 returns one issue with `decodeDemand: 1.2`,
`frameShortfallPct: 40`, `windowMs: 20000`, `affectedStreamsPercent: 66.667` (2 affected of 3
inbound), and `evaluatedStreams`, `throttledStreams`, `throtthedStreams` all equal to
`[overloadedEntry(B), overloadedEntry(C)]`.

1. "reports a saturated local decoder that drops frames". Three overloaded streams A, B, C.
   Expect calls 1 to 4 to return `[]`, call 5 to return exactly:

   ```ts
   [{
     type: 'cpu',
     reason: 'decoder-cpu-throttling',
     statsSample: {
       decodeDemand: 1.8,
       frameShortfallPct: 40,
       windowMs: 20000,
       affectedStreamsPercent: 100,
       evaluatedStreams: [overloadedEntry(A), overloadedEntry(B), overloadedEntry(C)],
       throttledStreams: [overloadedEntry(A), overloadedEntry(B), overloadedEntry(C)],
       throtthedStreams: [overloadedEntry(A), overloadedEntry(B), overloadedEntry(C)],
     },
   }]
   ```

   Also assert `statsSample.throtthedStreams === statsSample.throttledStreams` (same reference), and
   that call 6 returns `[]` because the history was cleared.
2. "does not report a sender whose frame rate wobbles" (from Milestone 1, now passing).
3. "does not report a costly decoder that keeps up". Four streams, `receivedFps: 30`,
   `decodeMsPerFrame: 10` (demand 0.3 each, 1.2 total), no shortfall. Expect all `[]`.
4. "does not report a shortfall when decode is cheap". Three streams, `receivedFps: 30`,
   `decodedFps: 24`, `decodeMsPerFrame: 1` (demand 0.03 each, 0.09 total, shortfall 20 percent).
   Expect all `[]`.
5. "does not report frames dropped after a successful decode". Three streams, `receivedFps: 30`,
   `decodedFps: 30`, `droppedFps: 12`, `decodeMsPerFrame: 20` (demand 0.6 each, 1.8 total,
   `framesDropped` rising, shortfall 0). Expect all `[]`.
6. "does not report while the inbound network is bad". Three overloaded streams; pass
   `{ inbound: 2.0 }` as network scores on call 3. Expect all six `[]`.
7. "excludes a stream with packet loss even when the network score is good". Stream A overloaded
   with `packetLossPct: 10`; B and C healthy. Pass `{ inbound: 3.5 }` on every call. A is skipped, B
   and C have no shortfall. Expect all `[]`.
8. "excludes a stream without packet counters". Stream A overloaded with
   `omit: ['packetsLost', 'packetsReceived']`; B and C healthy. Expect all `[]`.
9. "excludes a stream with high RTP jitter". Stream A overloaded with `jitterMs: 80`; B and C
   healthy. A is skipped by the jitter gate. Expect all `[]`.
10. "skips a hardware-decoded stream". Streams A, B, C overloaded; A has
    `powerEfficientDecoder: true`. Fires with B and C.
11. "does not report a received track that is not decoded". Stream A has `receivedFps: 30`,
    `decodedFps: 0`, `decodeMsPerFrame: 0`; B and C healthy. A is skipped because it decoded
    nothing, before any division. Expect all `[]`.
12. "does not report when the affected streams decode cheaply". Streams A and B have
    `receivedFps: 30`, `decodedFps: 15`, `decodeMsPerFrame: 2` (demand 0.06 each, shortfall 50
    percent each); streams C and D have `receivedFps: 30`, `decodeMsPerFrame: 10` (demand 0.3 each,
    no shortfall). Totals: demand 0.72 (above 0.7), shortfall 600 of 2400 = 25 percent (above 10),
    affected 2 of 4 = 50 percent (above 30), highest affected-stream demand 0.06 (not above 0.3).
    Expect all `[]`.
13. "does not report when too few streams show a shortfall". Stream A has `receivedFps: 30`,
    `decodedFps: 6`, `decodeMsPerFrame: 20`; B, C, D healthy. Totals: demand 0.6 + 0.36 = 0.96
    (above 0.7), shortfall 480 of 2400 = 20 percent (above 10), A's own demand 0.6 (above 0.3),
    affected 1 of 4 = 25 percent (not above 30). Expect all `[]`.
14. "keeps affectedStreamsPercentThreshold effective". Detector constructed with
    `{ affectedStreamsPercentThreshold: 100 }`, three overloaded streams. 100 is not above 100.
    Expect all `[]`.
15. "needs five samples". Three overloaded streams, four calls. Expect all `[]`.
16. "needs the window to span minWindowMs". Three overloaded streams, `intervalMs: 1000`, six
    samples (span 5000 ms). Expect all `[]`.
17. "evaluates a fast poll interval when the storage is large enough". Detector constructed with
    `{ maxParsedStatsStorageSize: 20 }`, three overloaded streams, `intervalMs: 1000`, 20 samples.
    The span reaches 15000 ms at call 16 (samples 0 to 15). Expect calls 1 to 15 `[]`, call 16
    fires with `windowMs: 15000`, `decodeDemand: 1.8`, `frameShortfallPct: 40`, and `allFps` of 15
    values.
18. "skips streams without totalDecodeTime". Three overloaded streams with
    `omit: ['totalDecodeTime']`. Expect all `[]`.
19. "skips a stream whose counters reset below the oldest sample". Streams A, B, C overloaded; A has
    `resetAtSample: 3` and `newIdAtSample: 3`. At call 5 A's counters in sample 3 (zero) are below
    sample 2 and its `id` changed, so A is skipped. Fires with B and C.
20. "skips a stream whose counters reset and regrow past the oldest sample". Build the samples with
    `baseline: { framesReceived: 100, framesDecoded: 100, totalDecodeTime: 1, packetsReceived: 200 }`.
    Streams A, B, C overloaded; A has `resetAtSample: 1` and no `newIdAtSample`, so its `id` never
    changes. At call 5 A's oldest counters are the baseline (100 received, 100 decoded, 1 s decode
    time, 200 packets) and its newest are three intervals of growth from zero (450 received, 270
    decoded, 5.4 s, 900 packets), so every endpoint delta is positive and the `id` is constant; only
    the adjacent-sample check (sample 0 to sample 1 decreases) can catch the reset. Fires with B and
    C.
21. "accepts the deprecated volatilityThreshold". Construct
    `new VideoDecoderIssueDetector({ volatilityThreshold: 1 })` and run test 3's streams. Expect all
    `[]`.
22. "respects a custom demand threshold". Construct with `{ decodeDemandThreshold: 2 }` and run
    three overloaded streams. Expect all `[]`.

### Milestone 3: documentation and delivery

Replace the `VideoDecoderIssueDetector` section of `README.md` (lines 109 to 122) with:

````md
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
any of them. A remote sender that lowers its frame rate does not trigger this issue.
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
````

Run lint for `src` and `test`, and the full test suite. Then follow the `delivery` skill for the
branch, the commit, the review gate, and the pull request. The remote of this clone is
`https://github.com/VLprojects/webrtc-issue-detector`, so the target is a GitHub pull request
against `master`; if the push to that remote is refused, push the branch to a fork and open the
pull request from there. The commit message is:

```
feat(VideoDecoderIssueDetector): measure local decode demand, not fps volatility

decoder-cpu-throttling fired on every receiver of a sender that lowered its
frame rate, because the detector only looked at inbound fps volatility. It
now requires, per peer connection, a local frame shortfall (received frames
not decoded) on more than affectedStreamsPercentThreshold of the inbound
streams over a window of at least minWindowMs, a summed decode demand
(totalDecodeTime per decoded frame times received frames per second) above
decodeDemandThreshold, and at least one affected stream whose own demand is
above affectedStreamDemandThreshold. Streams with packet loss above
maxPacketLossPct, with mean RTP jitter above maxJitterMs, decoded in
hardware (powerEfficientDecoder), without the required counters, with no
decoded frames, or with a counter reset inside the window are excluded.
framesDropped is no longer read.

Browsers drop a frame before decode only when a later frame is decodable
without it, so the detector covers streams with temporal layers (simulcast,
SVC) and is silent on single-layer streams, which decode every frame late
instead of dropping.

statsSample adds decodeDemand, frameShortfallPct, windowMs, evaluatedStreams
and throttledStreams. affectedStreamsPercent keeps its meaning (share of
inbound streams that show the problem) and is now rounded to three
decimals. throtthedStreams stays, deprecated, and still lists only the
affected streams; its entries keep allFps and volatility, deprecated, next
to the new numbers; allFps holds one value per stored sample (4 by default)
instead of exactly 5. The earliest emission moves from the sixth to the
fifth poll. affectedStreamsPercentThreshold keeps working.
volatilityThreshold is accepted and ignored; a high value no longer
silences the detector. New params: decodeDemandThreshold,
affectedStreamDemandThreshold, frameShortfallPctThreshold,
minFramesReceived, minWindowMs, maxPacketLossPct, maxJitterMs. The detector
now needs id, timestamp, framesReceived, framesDecoded, totalDecodeTime,
packetsReceived, packetsLost and jitter in the inbound video stats and is
silent without them. ParsedInboundVideoStreamStats gains an optional
powerEfficientDecoder field.
```

Commit the plan file in the same commit. Do not push without explicit approval.

## Concrete Steps

All commands run from the repository root.

Install dependencies once (yarn is not installed globally on this machine):

```
npx -y yarn@1.22.22 install --frozen-lockfile --non-interactive --ignore-engines
```

Expected tail: `Done in ...s.` with two peer dependency warnings about
`eslint-config-airbnb-typescript`.

Run the tests (Node 26 cannot start mocha here; Node 24 matches CI):

```
npx -y -p node@24 -c 'npm test'
```

Expected before any change: `36 passing`. After Milestone 1: `1 failing` and the failing test is
`wid/detectors/VideoDecoderIssueDetector does not report a sender whose frame rate wobbles`. After
Milestone 2: `58 passing` (36 existing plus 22 new).

Run only the new spec while iterating:

```
npx -y -p node@24 -c 'NODE_ENV=test node_modules/.bin/mocha --config test/utils/runners/mocha/.mocharc.js \
  test/detectors/VideoDecoderIssueDetector.spec.ts'
```

Lint:

```
npm run lint && npm run lint:tests
```

Expected: no output after the script banners.

## Validation and Acceptance

- `npx -y -p node@24 -c 'npm test'` reports `58 passing` and `0 failing`.
- The Milestone 1 checkpoint was observed and recorded: with the committed detector and only the
  wobble test in the spec, the suite reports `1 failing` with that test's name. This is the "fails
  before" evidence; reverting the detector after Milestone 2 does not work because the later tests
  do not compile against the old parameter interface.
- `npm run lint` and `npm run lint:tests` print no errors.
- In `README.md` the section `### VideoDecoderIssueDetector` mentions `decodeDemand`,
  `affectedStreamDemandThreshold`, `frameShortfallPct`, `minWindowMs`, `maxJitterMs`,
  `powerEfficientDecoder`, `affectedStreamsPercentThreshold`, `evaluatedStreams`, the required stats
  fields, the single-layer limitation, and the deprecated fields, and no longer mentions
  `allDecodeTimePerFrame`.
- The command below prints nothing:

  ```
  grep -n "isDtxLikeBehavior\|isSvcSpatialLayerChanged\|framesDropped\|stalled\|for (const" \
    src/detectors/VideoDecoderIssueDetector.ts
  ```
- Manual check, optional, in a three-party call through an SFU with simulcast enabled on this
  build. Throttle one participant's uplink to about 300 kbit/s: the other participants do not
  receive `decoder-cpu-throttling`. On one participant, run a CPU burner in another tab until the
  video stutters: that participant receives `decoder-cpu-throttling` with `frameShortfallPct` above
  10 within about 25 seconds, provided the streams are software decoded. On one participant,
  receive a video track for 25 seconds without attaching it to any element: no
  `decoder-cpu-throttling` appears. In a peer-to-peer call with a single-layer codec the detector
  stays silent under the same CPU burner; that is the documented limitation, not a defect.

Status of the manual check on 2026-09-04: the uplink throttle part passed in a consumer's local
video stack with a sender bitrate cap in place of a network shaper. The CPU burner part could not be
produced on an Apple silicon machine, so the positive path was checked with a stats shim instead;
the shim, the stack, and the results are in Artifacts and Notes. The unattached-track and the
peer-to-peer parts were not run.

## Artifacts and Notes

Milestone 1 checkpoint, observed 2026-09-04 with the committed detector (`c21f383`) and only the
wobble test in the spec, run with `npx -y -p node@24 -c 'NODE_ENV=test node_modules/.bin/mocha
--config test/utils/runners/mocha/.mocharc.js test/detectors/VideoDecoderIssueDetector.spec.ts'`:

```
  1) wid/detectors/VideoDecoderIssueDetector
       does not report a sender whose frame rate wobbles:

      AssertionError: expected [ [], [], [], [], [], [ { …(3) } ] ] to deeply equal [ [], [], [], [], [], [] ]
      -  [
      -    {
      -      "reason": "decoder-cpu-throttling"
      -      "statsSample": {
      -        "affectedStreamsPercent": 33.333333333333336
      -        "throtthedStreams": [
      -          {
      -            "allFps": [ 30, 30, 15, 30, 15 ]
      -            "ssrc": 594392
      -            "volatility": 30
      -          }
      -        ]
      -      }
      -      "type": "cpu"
      -    }
      -  ]
```

The sixth call fires with the predicted series, volatility, and share. Note for the next runner: a
nested `npx mocha` inside `npx -p node@24 -c '...'` fails with `npm error code EUSAGE`; call
`node_modules/.bin/mocha` directly, as above. Each run through the Node 24 wrapper takes two to
three minutes on this machine, so run it in the background.

### Browser validation in a consumer's local video stack, 2026-09-04

Stack: the consumer web app's development container (Create React App on Node 22), with this
branch's `dist/` and `package.json` copied over the container's
`node_modules/webrtc-issue-detector` and the dev server restarted; the signalling backend in its
container; a mediasoup SFU as a host process with VP8 first and simulcast on; a development
room that needs no token. Participants were driven with `playwright-core` from the
web app's `node_modules`, launching the installed Google Chrome with
`--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`, one browser context per
participant, and Playwright's Firefox 146 build headless with `media.navigator.streams.fake`,
`media.navigator.permission.disabled`, and `media.peerconnection.ice.loopback` set. Firefox only
connects when the SFU announces the machine's LAN address instead of 127.0.0.1. The web app's
`getStatsInterval` is 5000 ms, so the detector's first verdict comes after about 20 to 25 s. The
web app logs every issue as `GOT WEBRTC ISSUE`; the runs collected those from each page.

| Run | Setup | Result |
|---|---|---|
| Healthy call | 3 Chrome participants, 60 s, real stats, libvpx at 0.34 ms per frame | no issues on any participant |
| Sender cap | alpha's three simulcast encodings capped to 100 kbit/s each for 90 s | receivers saw alpha at 3 to 9 fps with a wobble on every sample; no issues on any participant |
| Shim on one receiver | charlie's `getStats` reports 40 percent shortfall at 33 ms per frame, 90 s | charlie reports `decoder-cpu-throttling` every 20 s; alpha and bravo silent |
| Leave and rejoin | charlie with the shim leaves and rejoins from a fresh page | nothing in the first 18 s after the rejoin; first report at 21 s with the new SSRCs; others silent |
| Machine overload | 6 participants; one runs 20 spinning workers on 10 cores plus 20x main-thread throttling | every participant reports encoder throttling, frozen tracks, network issues; no `decoder-cpu-throttling` anywhere; the SFU lost RabbitMQ and exited |
| Firefox, real stats | Chrome sender and receiver, Firefox receiver, 45 s | no decoder issue; all required fields present on Firefox |
| Firefox, shim | shim on the Firefox receiver, 60 s | Firefox reports `decoder-cpu-throttling`; the Chrome participants silent |

One report from the shim run, as the frontend logged it (stream list shortened):

```
cpu/decoder-cpu-throttling {"decodeDemand":1.319,"frameShortfallPct":40,"windowMs":25016,
  "affectedStreamsPercent":66.667,
  "evaluatedStreams":[{"ssrc":504583121,"decodeDemand":0.66,"avgDecodeTimeMs":33,
    "arrivalFps":19.987,"decodedFps":11.992,"shortfallPct":40,"packetLossPct":0,"jitterMs":0,
    "allFps":[20,20,20,20,20],"volatility":0}, …],
  "throttledStreams":[…], "throtthedStreams":[…]}
```

The 66.667 is two affected streams over three inbound entries; the third is mediasoup's probe
stream (ssrc 1234), see Surprises & Discoveries.

## Interfaces and Dependencies

No new dependencies. In `src/types.ts`, `ParsedInboundVideoStreamStats` gains
`powerEfficientDecoder?: boolean`. In `src/detectors/VideoDecoderIssueDetector.ts` these must exist
at the end:

```ts
interface VideoDecoderIssueDetectorParams extends BaseIssueDetectorParams {
  decodeDemandThreshold?: number;
  affectedStreamDemandThreshold?: number;
  frameShortfallPctThreshold?: number;
  affectedStreamsPercentThreshold?: number;
  minFramesReceived?: number;
  minWindowMs?: number;
  maxPacketLossPct?: number;
  maxJitterMs?: number;
  minMosQuality?: number;
  /** @deprecated */ volatilityThreshold?: number;
}

class VideoDecoderIssueDetector extends BaseIssueDetector {
  constructor(params?: VideoDecoderIssueDetectorParams);
  performDetection(data: WebRTCStatsParsedWithNetworkScores): IssueDetectorResult;
}
export default VideoDecoderIssueDetector;
```

The emitted issue has `type: 'cpu'`, `reason: 'decoder-cpu-throttling'`, and a `statsSample` with
the keys `decodeDemand`, `frameShortfallPct`, `windowMs`, `affectedStreamsPercent`,
`evaluatedStreams` (every evaluated stream), `throttledStreams` (only affected streams),
`throtthedStreams` (deprecated, same array as `throttledStreams`). Each stream entry has `ssrc`,
`decodeDemand`, `avgDecodeTimeMs`, `arrivalFps`, `decodedFps`, `shortfallPct`, `packetLossPct`,
`jitterMs`, `allFps` (deprecated), `volatility` (deprecated). All numbers are rounded to three
decimals.

## Revision note 1 (2026-09-04, after Codex adversarial review, round 1)

The first draft was reviewed by Codex before any code was written. It returned one high and three
medium findings; all four were accepted at the time:

- High: the draft removed `affectedStreamsPercent` and the per-stream `allFps` and `volatility`,
  and released as a patch. Consumers reading those keys would break at runtime. Now every legacy
  field stays populated, and the release is a minor (`feat:`).
- Medium: a stream with zero decoded frames was skipped, so a fully stalled decoder was invisible.
  A "stalled stream" clause was added. It was reverted after the first independent review; see
  revision note 4.
- Medium: the connection-level network score dilutes loss on one stream and cannot stop
  loss-caused shortfall from being blamed on the decoder. Now each stream's own packet loss over the
  window excludes it above `maxPacketLossPct`.
- Medium: five samples had no minimum duration, so a fast poll interval could fire on a sub-second
  burst. Now the window must span `minWindowMs`, and the README tells fast pollers to raise
  `maxParsedStatsStorageSize`.

While revising, re-reading the current code showed that it fires earliest at the sixth sample, not
the fifth. The Milestone 1 text was corrected.

## Revision note 2 (2026-09-04, after Codex adversarial review, round 2)

The revised draft was reviewed again. Three medium findings, all accepted:

- Missing `packetsLost` or `packetsReceived` was treated as zero loss, which let a loss-caused
  shortfall through on a browser that omits the counters. Both counters are now required; a stream
  without them is not evaluated.
- The reset check compared only the oldest and newest sample, so a reset that regrows past the old
  values went unnoticed. The detector now requires the same stats `id` in every window entry and
  non-decreasing counters between every pair of adjacent entries. Planning these tests showed that a
  fixture starting at zero cannot reproduce a reset, so the fixture builder now starts every counter
  at a non-zero baseline.
- `affectedStreamsPercentThreshold` was kept only as a no-op, so a caller who set it to 100 to
  silence the detector would get alerts again after a minor upgrade. It is now an effective gate on
  the share of streams with their own shortfall, default 30 as before. `volatilityThreshold` cannot
  keep a compatible meaning; the user chose to document that under a minor release rather than ship
  a major.

## Revision note 3 (2026-09-04, after Codex adversarial review, round 3)

The second revision was reviewed again. One high and one medium finding:

- Medium, accepted: the shortfall formula read `framesDropped`, which includes frames dropped after
  a successful decode because they missed their display deadline. The shortfall is now
  `received - decoded` only, `framesDropped` is not read, and test 5 checks that rising
  `framesDropped` with every frame decoded emits nothing.
- High, split: the review listed three compatibility breaks under a minor release. Two were accepted
  and fixed: `affectedStreamsPercent` had changed its denominator from all inbound streams to
  evaluated streams, and now uses all inbound video streams again; the legacy `throtthedStreams`
  array had been filled with every evaluated stream, which would make consumers mark healthy streams
  as throttled, and now holds only the affected streams as today, with the full breakdown in the new
  `evaluatedStreams` field. The third, `volatilityThreshold` becoming a no-op, was put to the user a
  second time with a major release as the alternative. The user kept the minor release; the
  reasoning is in the Decision Log.

## Revision note 4 (2026-09-04, after the first independent review by a separate Claude agent)

A fresh Claude agent with no conversation context reviewed the third revision against the code,
recomputed the test arithmetic, and read the three Codex outcomes. It confirmed the code claims and
18 of 19 test computations, agreed with every Codex outcome except one, and found four things all
three rounds missed. All accepted:

- High: the stalled-stream clause fired on tracks Chrome deliberately does not decode because they
  have no sink, which is a common UI pattern. The clause is reverted: a stream with zero decoded
  frames is skipped, `stalled` and `stalledStreams` leave the payload, and a test checks that an
  undecoded track emits nothing.
- Medium: `packetsLost` can decrease, so the adjacent-sample check would skip streams at random
  under mild recoverable loss. It leaves the monotonic set and its delta is clamped at zero.
- Medium: the summed demand grows with the participant count because browsers decode streams on
  separate threads, so in large calls the sum is always above 0.7. A fourth condition requires at
  least one affected stream with its own demand above `affectedStreamDemandThreshold` (default
  0.3). A test covers it. The README calls the sum a load proxy.
- Medium: the regrow-reset test left `totalDecodeTime` at its default baseline, so the endpoint
  delta was negative and the test did not isolate the adjacent-sample check; the `id` also changed.
  The baseline now sets `totalDecodeTime: 1`, the `id` stays constant, and the assertion runs in a
  scenario that fires so the skip is visible in `evaluatedStreams`. The `id` change moved to the
  below-oldest reset test through a new `newIdAtSample` option.
- Medium: sums are per peer connection, not per device. Stated in the Purpose, the Decision Log,
  the Context, and the README.
- Low items folded in: the denominator dilution by paused streams is acknowledged; the `id`
  rationale is softened because Chrome derives the id from the SSRC; the required stats fields and
  the resulting silence on browsers that omit them are in the README and the commit body; the
  connection score guard is described as close to inert; the 35 second cleanup is described as an
  idle timeout; the fixture states that sample 0 holds the baseline and no interval; the
  `framesDropped` description covers both kinds of drop.

The agent agreed with the user's minor-over-major decision, citing commit `d6b7dcf` as precedent
(the precedent holds, but the description of that commit was wrong; see revision note 5).

## Revision note 5 (2026-09-04, after the second independent review by a separate Claude agent)

A second fresh Claude agent reviewed the fourth revision, re-derived all 20 tests in a simulation,
ran the existing suite, and read the libwebrtc receive pipeline (`frame_decode_timing.cc`,
`api/video/frame_buffer.cc`, `video_stream_buffer_controller.cc`, `receive_statistics_proxy.cc`)
plus the Firefox and WebKit stats IDL. The arithmetic and nearly every code claim held. Two high
findings concerned the detection model itself:

- High: on a single-layer stream libwebrtc never drops a frame before decode, because every frame
  is needed as a reference; an overloaded receiver decodes every frame late and shows no shortfall.
  The plan had promised coverage of a peer-to-peer participant who overloads their own CPU. The
  user chose to document this as a limitation rather than add a second signal based on decode duty
  cycle, because that signal needs a hardware flag that Firefox, Safari, and capture-less Chrome do
  not provide, and a threshold without field data; this change must not trade one false positive
  for another. Purpose, Decision Log, README, commit body, and the manual check now say so.
- High: packet loss does not create a shortfall in current Chrome (frames behind a lost reference
  are never counted as received), so the loss gate guarded the wrong path. Late arrival on a
  temporal-layer stream does create a shortfall with zero loss, and a hardware or 1080p decode
  reaches the 0.3 per-stream floor without CPU cost, so a jittery link plus one such stream would
  have fired. Now streams with `powerEfficientDecoder === true` are skipped (type field added), a
  per-stream mean RTP jitter gate `maxJitterMs` (default 30) is added with `jitter` as a required
  field, and the loss gate is kept as belt and braces with a corrected rationale. Tests 9 and 10
  cover the two new skips.
- Medium: the totals were not rounded in the code block, and `0.6 + 0.6 + 0.6` is not `1.8`; the
  payload now rounds the totals explicitly and the comparisons use unrounded values.
- Medium: the stash-based "fails before" check cannot compile; the Milestone 1 checkpoint is the
  evidence instead.
- Medium: the description of commit `d6b7dcf` was wrong; it introduced the volatility detector and
  the wrong README example together, and the minor-release precedent rests on its deletion of
  `FramesDroppedIssueDetector`.
- Low items folded in: line numbers corrected (127 lines, `allFps` at line 97, gate at line 64,
  types to line 278); test 4 demand corrected to 0.03 per stream; the fixture defines the
  `packetsLost` formula and states that `timestamp` is not reset; three compatibility deltas are
  named in the Decision Log and the commit body; the README lists `id` and `timestamp` among the
  required fields; the `for...of` lint ban is stated; the shortfall is described as a lower bound.

The test count is now 22 and the expected total 58 passing.

## Revision note 6 (2026-09-04, during the build)

Changes made while executing the plan, all detail-level:

- The Concrete Steps command for a single spec run used a nested `npx mocha`, which fails inside
  `npx -p node@24 -c` with `npm error code EUSAGE`. It now calls `node_modules/.bin/mocha` directly.
- The Node 24 wrapper takes two to three minutes per run on this machine; the note in Artifacts
  tells the next runner to use a background run.
- The Milestone 1 checkpoint output is recorded in Artifacts and Notes.
- The three milestones landed in one commit, because Milestone 1's state (spec failing against the
  old detector) is a checkpoint, not a shippable state, and the commit message in Milestone 3
  describes the whole change.

## Revision note 7 (2026-09-04, after the browser validation)

Living sections updated with the local browser runs: a Progress entry, three observations (the
mediasoup probe stream in the `affectedStreamsPercent` denominator, Firefox without
`powerEfficientDecoder`, and why CPU throttling and a burner cannot starve the decoder on this
machine), three decisions (validate the positive path with a `getStats` shim, leave the
denominator for a follow-up, document the Firefox limitation), a status paragraph under the manual
check in Validation, a results table in Artifacts and Notes, and a rewritten closing of Outcomes &
Retrospective. No code changed in this revision.
