import { Context, Schema, Service, version } from "koishi";
import os from "node:os";
import fs from "node:fs/promises";
import path from "path";
import LockUtil from "./LockUtil";

declare module "koishi" {
  interface Context {
    umamiStatisticsService: UmamiStatisticsService;
  }
}

interface Payload {
  website: string;
  hostname?: string;
  language?: string;
  referrer?: string;
  screen?: string;
  title?: string;
  url?: string;
  name?: string;
  data?: Record<string, any>;
}

const ServiceName = "umamiStatisticsService";

class UmamiStatisticsService extends Service {
  _ctx: Context;
  _config: UmamiStatisticsService.Config;
  userAgentOs: string;

  constructor(ctx: Context, config: UmamiStatisticsService.Config) {
    super(ctx, ServiceName);
    this._ctx = ctx;
    this._config = config;
  }

  async send({
    dataHostUrl,
    website,
    url = "/",
    urlSearchParams,
    title,
    eventName,
    data,
  }: {
    dataHostUrl?: string;
    website: string;
    url?: string;
    urlSearchParams?: Record<string, any>;
    title?: string;
    eventName?: string;
    data?: Record<string, any>;
  }) {
    if (!this._config.anonymousStatistics) {
      return;
    }
    await LockUtil.synchronized({
      key: ServiceName,
      fn: async () => {
        const searchParams = new URLSearchParams();
        if (searchParams) {
          for (const key in urlSearchParams) {
            searchParams.set(key, urlSearchParams[key]);
          }
        }
        let packageJson = await this.getCallerPackage();
        if (!packageJson) {
          packageJson = {
            name: this.ctx.name,
            version: this.ctx.scope.uid,
          };
        }
        searchParams.set("koishi_version", version);
        searchParams.set("plugin_name", packageJson.name);
        searchParams.set("plugin_version", packageJson.version);
        await this._ctx.http.post(
          (dataHostUrl || this._config.dataHostUrl) + "/api/send",
          JSON.stringify({
            type: "event",
            payload: {
              website,
              hostname: os.hostname(),
              screen: "3440x1440",
              language: this._ctx.root.config.i18n?.locales?.[0],
              url: url.replace(/\?[\s\S]*/, "") + "?" + searchParams.toString(),
              title,
              name: eventName,
              data,
            } as Payload,
          }),
          {
            headers: {
              "content-type": "application/json",
              "User-Agent": `Mozilla/5.0 (${this.getUserAgentOs()}) Chrome/11.4.5.14`,
            },
          },
        );
      },
    });
  }

  async getCallerPackage(): Promise<any> {
    const basePath = path.join(__filename, "../../../");
    const prepareStackTrace = Error.prepareStackTrace;
    const stackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 99;
    Error.prepareStackTrace = (error, stackTrace) => stackTrace;
    let callerPath: string;
    try {
      const stacks = new Error().stack as any as any[];
      if (stacks?.[0]?.constructor?.name !== "CallSite") {
        return;
      }
      const target = stacks
        .filter((stack) => {
          let fileName = stack.getFileName();
          return !(
            !fileName ||
            !fileName.startsWith(basePath) ||
            fileName.includes("umami-statistics-service") ||
            fileName.includes("@cordisjs\\") ||
            fileName.includes("@koishijs\\") ||
            fileName.startsWith("node:")
          );
        })
        .map((item) => item.getFileName())[0];
      if (!target) {
        return;
      }
      const rBasePath = basePath.replace(/\\/g, "\\\\");
      const rSep = path.sep.replace(/\\/g, "\\\\");
      const callerName = target.match(
        new RegExp(`${rBasePath}([^${rSep}]+).*$`),
      )?.[1];
      if (!callerName) {
        return;
      }
      callerPath = path.join(basePath, callerName);
    } catch (e) {
    } finally {
      Error.prepareStackTrace = prepareStackTrace;
      Error.stackTraceLimit = stackTraceLimit;
    }
    try {
      const packageBuf = await fs.readFile(
        path.join(callerPath, "package.json"),
      );
      return JSON.parse(packageBuf.toString());
    } catch (e) {}
  }

  getUserAgentOs() {
    if (!this.userAgentOs) {
      this.userAgentOs = this.buildUserAgentOs();
    }
    return this.userAgentOs;
  }

  buildUserAgentOs() {
    switch (os.platform()) {
      case "aix": {
        return "X11; U; AIX 005A471A4C00; en-US; rv:1.0rc2";
      }
      case "android": {
        return "Android 13; Mobile; rv:126.0";
      }
      case "darwin": {
        return "Macintosh; Intel Mac OS X 13_6_0";
      }
      case "freebsd": {
        return "X11; FreeBSD amd64; rv:122.0";
      }
      case "haiku": {
        return "X11; Haiku x86_64";
      }
      case "linux": {
        return "X11; Linux x86_64";
      }
      case "openbsd": {
        return "X11; OpenBSD amd64;";
      }
      case "sunos": {
        return "X11; U; SunOS sun4u;";
      }
      case "cygwin": {
        return "Win16;";
      }
      case "netbsd": {
        return "X11; NetBSD amd64;";
      }
      case "win32": {
        const version = os.release().replace(/^([^.]+\.[^.]+)[\s\S]*/, "$1");
        switch (os.arch()) {
          case "x64":
            return "Windows NT " + version + "; Win64; x64";
          case "x86":
            return "Windows NT " + version + "; Win32; x86";
          case "arm":
            return "Windows NT " + version + "; ARM";
          default:
            return "Windows NT " + version;
        }
      }
      default: {
        return os.platform() + " " + os.arch() + ";";
      }
    }
  }
}

namespace UmamiStatisticsService {
  export const inject = ["http"];

  export interface Config {
    anonymousStatistics: boolean;
    dataHostUrl: string;
  }

  export const Config: Schema<Config> = Schema.object({
    anonymousStatistics: Schema.boolean().default(true),
    dataHostUrl: Schema.string().default("https://data.itzdrli.cc"),
  });
}

export default UmamiStatisticsService;
