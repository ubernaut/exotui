// Copyright 2026 ubernaut. MIT license.

import { runtimeHost } from "@ubernaut/exotui/runtime";
import type { ExomuxWebSocketClient } from "../../client.ts";

/** Exercises kernel terminal signals and foreground job ownership through the daemon protocol. */
export async function verifyNativeJobControl(client: ExomuxWebSocketClient): Promise<{
  controllingTerminal: true;
  resizeSignal: true;
  suspendResume: true;
  interrupt: true;
}> {
  const shell = await client.spawn({
    command: "/bin/bash",
    args: ["--noprofile", "--norc", "-i"],
    env: { PS1: "EXOMUX_TEST_PROMPT> ", TERM: "xterm-256color" },
    columns: 80,
    rows: 24,
  });
  let output = "";
  let foregroundJob: number | undefined;
  try {
    const attached = await client.attach(shell.id, {
      sinceSequence: 0,
      onOutput: (frame) => output += decode(frame.data),
    });
    output += attached.replay.map((frame) => decode(frame.data)).join("");
    await waitFor(() => output.includes("EXOMUX_TEST_PROMPT> "));
    if (output.includes("no job control")) throw new Error(`Shell has no job control: ${output}`);
    await client.input(
      shell.id,
      "stty -echo; trap 'printf \"__WINCH__\\n\"; stty size' WINCH; printf '__SHELL_PID:%s__\\n' \"$$\"\n",
    );
    await waitFor(() => /__SHELL_PID:(\d+)__/.test(output));
    const shellPid = Number(output.match(/__SHELL_PID:(\d+)__/)![1]);
    const initial = await processState(shellPid);
    if (
      initial.tty === 0 || initial.group !== shellPid || initial.session !== shellPid || initial.foreground !== shellPid
    ) {
      throw new Error(`Shell does not own its controlling terminal: ${JSON.stringify(initial)}`);
    }

    output = "";
    await client.resize(shell.id, 127, 41);
    await waitFor(() => output.includes("__WINCH__") && output.includes("41 127"));
    output = "";
    await client.input(shell.id, "printf '__JOB_STARTED__\\n'; sleep 30\n");
    await waitFor(() => output.includes("__JOB_STARTED__"));
    await waitFor(async () => {
      const state = await processState(shellPid);
      if (state.foreground > 0 && state.foreground !== shellPid) foregroundJob = state.foreground;
      return foregroundJob !== undefined;
    });
    const running = await processState(foregroundJob!);
    if (running.session !== shellPid || running.group !== foregroundJob) {
      throw new Error(`Foreground job is outside the shell session: ${JSON.stringify(running)}`);
    }

    await client.input(shell.id, "\x1a");
    await waitFor(async () =>
      output.includes("Stopped") && (await processState(shellPid)).foreground === shellPid &&
      (await processState(foregroundJob!)).state === "T"
    );
    output = "";
    await client.input(shell.id, "fg\n");
    await waitFor(async () =>
      (await processState(shellPid)).foreground === foregroundJob &&
      (await processState(foregroundJob!)).state !== "T"
    );
    await client.input(shell.id, "\x03");
    await waitFor(async () =>
      output.includes("EXOMUX_TEST_PROMPT> ") && (await processState(shellPid)).foreground === shellPid
    );
    await waitFor(async () => await processState(foregroundJob!).then(() => false, () => true));
    foregroundJob = undefined;
    return { controllingTerminal: true, resizeSignal: true, suspendResume: true, interrupt: true };
  } finally {
    if (foregroundJob !== undefined) {
      // This process group came from the freshly spawned test shell's controlling terminal.
      try {
        runtimeHost.kill(-foregroundJob, "SIGKILL");
      } catch { /* already exited */ }
    }
    await client.kill(shell.id).catch(() => undefined);
  }
}

async function processState(pid: number): Promise<{
  state: string;
  group: number;
  session: number;
  tty: number;
  foreground: number;
}> {
  const stat = await runtimeHost.readTextFile(`/proc/${pid}/stat`);
  const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  return {
    state: fields[0]!,
    group: Number(fields[2]),
    session: Number(fields[3]),
    tty: Number(fields[4]),
    foreground: Number(fields[5]),
  };
}

function decode(data: string | Uint8Array): string {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for native shell job control.");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}
