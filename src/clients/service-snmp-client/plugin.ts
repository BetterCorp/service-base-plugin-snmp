import { ServicesClient, ServiceCallable } from "@bettercorp/service-base";
import {
  GetValueResponse,
  SessionTransport,
  SessionVersion,
  SNMPCEmitAndReturnEvents,
  VarBind,
} from "../../plugins/service-snmp-client/plugin";
import { MyPluginConfig } from "../../plugins/service-snmp-client/sec.config";

export class snmpClient extends ServicesClient<
  ServiceCallable,
  ServiceCallable,
  SNMPCEmitAndReturnEvents,
  ServiceCallable,
  ServiceCallable,
  MyPluginConfig
> {
  async getValues(
    version: SessionVersion,
    target: string,
    community: string,
    port: number,
    transport: SessionTransport,
    oids: Array<string>
  ): Promise<Array<GetValueResponse>> {
    return await this._plugin.emitEventAndReturnTimed(
      "getValues",
      5 + oids.length * 0.5,
      version,
      target,
      community,
      port,
      5000,
      transport,
      oids
    );
  }

  async setValues(
    version: SessionVersion,
    target: string,
    community: string,
    port: number,
    transport: SessionTransport,
    oidVars: Array<VarBind>
  ): Promise<Array<GetValueResponse>> {
    return await this._plugin.emitEventAndReturnTimed(
      "setValues",
      5 + oidVars.length * 0.5,
      version,
      target,
      community,
      port,
      5000,
      transport,
      oidVars
    );
  }
}
