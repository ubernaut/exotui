import { runtimeHost } from "./host.ts";
// Copyright 2023 Im-Beast. MIT license.

/** Stable identity for a Linux process across PID reuse. */
export interface LinuxProcessIdentity {
  readonly pid: number;
  readonly startTime: string;
}

export interface LinuxProcessStat extends LinuxProcessIdentity {
  readonly parentPid: number;
  readonly processGroupId: number;
  readonly sessionId: number;
  readonly foregroundProcessGroupId: number;
}

/** Takes a cheap snapshot of the current process's direct Linux children. */
export function snapshotLinuxDirectChildren(parentPid = runtimeHost.pid): ReadonlySet<number> | undefined {
  if (runtimeHost.build.os !== "linux") return undefined;
  try {
    const value = runtimeHost.readTextFileSync(`/proc/${parentPid}/task/${parentPid}/children`).trim();
    if (!value) return new Set();
    return new Set(
      value.split(/\s+/).map(Number).filter((pid) => Number.isSafeInteger(pid) && pid > 0),
    );
  } catch {
    return undefined;
  }
}

/** Finds the direct child synchronously created after a prior child snapshot. */
export function identifySpawnedLinuxChild(
  previous: ReadonlySet<number> | undefined,
  parentPid = runtimeHost.pid,
): LinuxProcessIdentity | undefined {
  if (!previous) return undefined;
  const current = snapshotLinuxDirectChildren(parentPid);
  if (!current) return undefined;
  let newest: LinuxProcessStat | undefined;
  for (const pid of current) {
    if (previous.has(pid)) continue;
    const stat = readLinuxProcessStat(pid);
    if (!stat || stat.parentPid !== parentPid) continue;
    if (!newest || compareStartTimes(stat.startTime, newest.startTime) > 0) newest = stat;
  }
  return newest && { pid: newest.pid, startTime: newest.startTime };
}

/** Returns the foreground process name for a retained terminal leader. */
export function inspectLinuxForegroundProcessTitle(identity: LinuxProcessIdentity): string | undefined {
  if (runtimeHost.build.os !== "linux") return undefined;
  const leader = readLinuxProcessStat(identity.pid);
  if (!leader || leader.startTime !== identity.startTime) return undefined;
  const foregroundPid = leader.foregroundProcessGroupId;
  if (foregroundPid > 0) {
    const foreground = readLinuxProcessStat(foregroundPid);
    if (foreground?.sessionId === leader.sessionId) {
      const title = readLinuxProcessName(foregroundPid);
      if (title) return title;
    }
  }
  return readLinuxProcessName(identity.pid);
}

export function readLinuxProcessStat(pid: number): LinuxProcessStat | undefined {
  if (runtimeHost.build.os !== "linux" || !Number.isSafeInteger(pid) || pid <= 0) return undefined;
  try {
    return parseLinuxProcessStat(runtimeHost.readTextFileSync(`/proc/${pid}/stat`));
  } catch {
    return undefined;
  }
}

/** Parses `/proc/<pid>/stat`, including command names containing spaces or `)`. */
export function parseLinuxProcessStat(value: string): LinuxProcessStat | undefined {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(") ");
  if (open <= 0 || close <= open) return undefined;
  const pid = Number(value.slice(0, open).trim());
  const fields = value.slice(close + 2).trim().split(/\s+/);
  if (!Number.isSafeInteger(pid) || pid <= 0 || fields.length < 20) return undefined;
  const parentPid = Number(fields[1]);
  const processGroupId = Number(fields[2]);
  const sessionId = Number(fields[3]);
  const foregroundProcessGroupId = Number(fields[5]);
  const startTime = fields[19];
  if (
    !Number.isSafeInteger(parentPid) || !Number.isSafeInteger(processGroupId) ||
    !Number.isSafeInteger(sessionId) || !Number.isSafeInteger(foregroundProcessGroupId) ||
    !startTime || !/^\d+$/.test(startTime)
  ) return undefined;
  return { pid, parentPid, processGroupId, sessionId, foregroundProcessGroupId, startTime };
}

/** Normalizes a process-controlled `comm` value for safe terminal chrome. */
export function sanitizeLinuxProcessTitle(value: string, maximumLength = 128): string | undefined {
  const limit = Math.max(0, Math.floor(maximumLength));
  let result = "";
  let pendingSpace = false;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || /\s/u.test(char)) {
      pendingSpace = result.length > 0;
      continue;
    }
    if (pendingSpace && result.length < limit) result += " ";
    pendingSpace = false;
    if (result.length + char.length > limit) break;
    result += char;
  }
  const normalized = result.trim();
  return normalized || undefined;
}

function readLinuxProcessName(pid: number): string | undefined {
  try {
    return sanitizeLinuxProcessTitle(runtimeHost.readTextFileSync(`/proc/${pid}/comm`));
  } catch {
    return undefined;
  }
}

function compareStartTimes(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
}
