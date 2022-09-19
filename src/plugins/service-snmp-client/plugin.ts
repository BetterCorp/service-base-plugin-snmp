import {
  IPluginLogger,
  ServiceCallable,
  ServicesBase,
} from "@bettercorp/service-base";
import { MyPluginConfig } from "./sec.config";
const snmp = require("net-snmp");

export interface GetValueResponse {
  oid: string;
  value?: any;
  error?: any;
}
export interface VarBind {
  oid: string,
  type: string,
  value: any
}
export interface SNMPCEmitAndReturnEvents extends ServiceCallable {
  getValues(
    version: SessionVersion,
    target: string,
    community: string,
    port: number,
    timeout: number,
    transport: SessionTransport,
    oids: Array<string>
  ): Promise<Array<GetValueResponse>>;
  setValues(
    version: SessionVersion,
    target: string,
    community: string,
    port: number,
    timeout: number,
    transport: SessionTransport,
    oidVars: Array<VarBind>
  ): Promise<Array<GetValueResponse>>;
}
export enum SessionVersion {
  Version1 = snmp.Version1,
  Version2 = snmp.Version2c,
  Version3 = snmp.Version3,
}
export enum SessionTransport {
  udp4 = "udp4",
  udp6 = "udp6",
}
export interface SessionOptions {
  port: number;
  retries: number;
  timeout: number;
  backoff: number;
  transport: SessionTransport;
  trapPort: number;
  version: SessionVersion;
  backwardsGetNexts: boolean;
  idBitsSize: number;
}
export interface CachedSession {
  createdTime: number;
  lastAccessedTime: number;
  version: SessionVersion;
  target: string;
  community: string;
  options: SessionOptions;
  session: any;
}

export class Service extends ServicesBase<
  ServiceCallable,
  ServiceCallable,
  SNMPCEmitAndReturnEvents,
  ServiceCallable,
  ServiceCallable,
  MyPluginConfig
> {
  private sessionCleanupTimer: NodeJS.Timer | undefined;
  private cachedSessions: Array<CachedSession> = [];
  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);
  }

  public override async init() {
    const self = this;
    this.onReturnableEvent(
      "getValues",
      async (
        version: SessionVersion,
        target: string,
        community: string,
        port: number,
        timeout: number,
        transport: SessionTransport,
        oids: Array<string>
      ): Promise<Array<GetValueResponse>> => {
        let session = await self.createSession(
          version,
          target,
          community,
          port,
          timeout,
          transport
        );
        return new Promise((resolve, reject) => {
          session.get(oids, (error: any, varbinds: any) => {
            if (error) {
              return reject(error);
            } else {
              let returnData: Array<GetValueResponse> = [];
              for (var i = 0; i < varbinds.length; i++) {
                // for version 1 we can assume all OIDs were successful
                if (version === SessionVersion.Version1) {
                  returnData.push({
                    oid: varbinds[i].oid,
                    value: varbinds[i].value,
                  });
                  continue;
                }

                // for version 2c we must check each OID for an error condition
                if (snmp.isVarbindError(varbinds[i]))
                  returnData.push({
                    oid: varbinds[i].oid,
                    error: snmp.varbindError(varbinds[i]),
                  });
                else
                  returnData.push({
                    oid: varbinds[i].oid,
                    value: varbinds[i].value,
                  });
              }
              resolve(returnData);
            }
          });
        });
      }
    );
    this.onReturnableEvent(
      "setValues",
      async (
        version: SessionVersion,
        target: string,
        community: string,
        port: number,
        timeout: number,
        transport: SessionTransport,
        oidVars: Array<VarBind>
      ): Promise<Array<GetValueResponse>> => {
        let session = await self.createSession(
          version,
          target,
          community,
          port,
          timeout,
          transport
        );
        return new Promise((resolve, reject) => {
          session.set(oidVars, (error: any, varbinds: any) => {
            if (error) {
              return reject(error);
            } else {
              let returnData: Array<GetValueResponse> = [];
              for (var i = 0; i < varbinds.length; i++) {
                // for version 1 we can assume all OIDs were successful
                if (version === SessionVersion.Version1) {
                  returnData.push({
                    oid: varbinds[i].oid,
                    value: varbinds[i].value,
                  });
                  continue;
                }

                // for version 2c we must check each OID for an error condition
                if (snmp.isVarbindError(varbinds[i]))
                  returnData.push({
                    oid: varbinds[i].oid,
                    error: snmp.varbindError(varbinds[i]),
                  });
                else
                  returnData.push({
                    oid: varbinds[i].oid,
                    value: varbinds[i].value,
                  });
              }
              resolve(returnData);
            }
          });
        });
      }
    );
  }

  private clearAndCloseSession(index: number) {
    this.cachedSessions[index].session.close();
    this.cachedSessions.splice(index, 1);
  }
  private clearAndCloseSessionsToLimit(limit: number) {
    while (this.cachedSessions.length > limit) {
      this.clearAndCloseSession(0);
    }
  }

  private async cleanOlderSessions() {
    const nowBack =
      new Date().getTime() - (await this.getPluginConfig()).maxSessionTimeout;
    for (let i = this.cachedSessions.length - 1; i >= 0; i--) {
      if (this.cachedSessions[i].lastAccessedTime < nowBack) {
        this.clearAndCloseSession(i);
      }
    }
  }
  private async createSession(
    version: SessionVersion,
    target: string,
    community: string,
    port: number,
    timeout: number,
    transport: SessionTransport
  ) {
    let sesh: any = undefined;
    let seshOpts: SessionOptions | undefined = undefined;
    const now = new Date().getTime();
    for (let i = this.cachedSessions.length - 1; i >= 0; i--) {
      if (this.cachedSessions[i].target !== target) continue;
      if (this.cachedSessions[i].community !== community) continue;
      if (this.cachedSessions[i].version !== version) continue;
      if (this.cachedSessions[i].options.port !== port) continue;
      if (this.cachedSessions[i].options.transport !== transport) continue;
      this.cachedSessions[i].lastAccessedTime = now;
      return this.cachedSessions[i].session;
    }

    if (version === SessionVersion.Version3) {
      seshOpts = {
        port: port || 161,
        retries: 1,
        timeout: timeout || 5000,
        backoff: 1.0,
        transport: transport || SessionTransport.udp4,
        trapPort: 162,
        version: SessionVersion.Version3,
        backwardsGetNexts: true,
        idBitsSize: 32,
      };
      sesh = snmp.createV3Session(target, community, seshOpts);
    }
    if (
      version === SessionVersion.Version2 ||
      version === SessionVersion.Version1
    ) {
      seshOpts = {
        port: port || 161,
        retries: 1,
        timeout: timeout || 5000,
        backoff: 1.0,
        transport: transport || SessionTransport.udp4,
        trapPort: 162,
        version: SessionVersion.Version3,
        backwardsGetNexts: true,
        idBitsSize: 32,
      };
      sesh = snmp.createSession(target, community, seshOpts);
    }
    if (sesh === undefined) throw "Unknown session version!!!!";
    if (seshOpts === undefined) throw "Unknown session config!!!!";

    this.clearAndCloseSessionsToLimit(
      (await this.getPluginConfig()).maxSessions
    );

    this.cachedSessions.push({
      createdTime: now,
      lastAccessedTime: now,
      version,
      target,
      community,
      options: seshOpts,
      session: sesh,
    });
    return sesh;
  }
  public override async run() {
    const self = this;
    this.sessionCleanupTimer = setInterval(
      async () => await self.cleanOlderSessions(),
      (await this.getPluginConfig()).maxSessionTimer
    );
  }
  public override dispose(): void {
    this.clearAndCloseSessionsToLimit(0);
    clearInterval(this.sessionCleanupTimer);
  }
}
