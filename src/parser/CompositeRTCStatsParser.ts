/* eslint-disable class-methods-use-this */
import {
  CompositeStatsParser, ConnectionInfo, StatsParser, StatsReportItem,
} from '../types';
import { checkIsConnectionClosed } from './utils';

export interface AddConnectionPayload {
  id?: string;
  pc: RTCPeerConnection;
}

export interface RemoveConnectionPayload {
  pc: RTCPeerConnection;
}

interface CompositeRTCStatsParserParams {
  statsParser: StatsParser;
}

class CompositeRTCStatsParser implements CompositeStatsParser {
  private readonly connections: ConnectionInfo[] = [];

  private readonly statsParser: StatsParser;

  constructor(params: CompositeRTCStatsParserParams) {
    this.statsParser = params.statsParser;
  }

  listConnections(): ConnectionInfo[] {
    return [...this.connections];
  }

  addPeerConnection(payload: AddConnectionPayload): void {
    this.connections.push({
      id: payload.id ?? String(Date.now() + Math.random().toString(32)),
      pc: payload.pc,
    });
  }

  removePeerConnection(payload: RemoveConnectionPayload): void {
    const pcIdxToDelete = this.connections.findIndex(({ pc }) => pc === payload.pc);

    if (pcIdxToDelete >= 0) {
      this.removeConnectionsByIndexes([pcIdxToDelete]);
    }
  }

  async parse(): Promise<StatsReportItem[]> {
    // DESC order to remove elements afterwards without index shifting
    const closedConnectionsIndexesDesc: number[] = [];

    const statsPromises = this.connections.map(
      async (
        info,
        index: number,
      ): Promise<StatsReportItem | undefined> => {
        if (checkIsConnectionClosed(info.pc)) {
          closedConnectionsIndexesDesc.unshift(index);
          return undefined;
        }

        return this.statsParser.parse(info);
      },
    );

    if (closedConnectionsIndexesDesc.length) {
      this.removeConnectionsByIndexes(closedConnectionsIndexesDesc);
    }

    const statsItemsByPC = await Promise.all(statsPromises);

    return statsItemsByPC.filter((item) => item !== undefined) as StatsReportItem[];
  }

  private removeConnectionsByIndexes(closedConnectionsIndexesDesc: number[]) {
    closedConnectionsIndexesDesc.forEach((idx) => {
      this.connections.splice(idx, 1);
    });
  }
}

export default CompositeRTCStatsParser;
