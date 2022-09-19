import { SecConfig } from "@bettercorp/service-base";

export interface MyPluginConfig {
  maxSessions: number; // Max Sessions: The maximum amount of sessions to keep
  maxSessionTimeout: number; // Max Session Timeout: The maximum time in MS before a session is autoclosed
  maxSessionTimer: number; // Max Session Interval: The time in MS to run the cleanup
}

export class Config extends SecConfig<MyPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: MyPluginConfig
  ): MyPluginConfig {
    return {
      maxSessions: existingConfig.maxSessions !== undefined  ? existingConfig.maxSessions : 50,
      maxSessionTimeout: existingConfig.maxSessionTimeout !== undefined  ? existingConfig.maxSessionTimeout : 1000 * 60 * 2,
      maxSessionTimer: existingConfig.maxSessionTimer !== undefined  ? existingConfig.maxSessionTimer : 60000,
    };
  }
}
