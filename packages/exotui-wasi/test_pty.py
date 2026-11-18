"""Exercise the packaged launcher through a private Linux PTY."""
import errno
import fcntl
import json
import os
import pty
import re
import select
import signal
import sqlite3
import struct
import subprocess
import sys
import termios
import time


def check(launcher, component, state, interrupt, show_hints):
    master, slave = pty.openpty()
    before = termios.tcgetattr(slave)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 28, 90, 0, 0))
    data = bytearray()

    def drain_until(marker, seconds=35):
        deadline = time.monotonic() + seconds
        while marker not in data and time.monotonic() < deadline:
            if select.select([master], [], [], 0.1)[0]:
                try:
                    data.extend(os.read(master, 65536))
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    break
            elif proc.poll() is not None:
                break
        assert marker in data, f'missing {marker!r}; exit={proc.poll()}; output tail={data[-500:]!r}'

    try:
        with subprocess.Popen(
            [launcher, component, state], stdin=slave, stdout=slave, stderr=slave,
            env={'TERM': 'xterm-256color', 'PATH': ''},
        ) as proc:
            try:
                drain_until('exowebtui'.encode())
                drain_until(b'\x1b[28;')
                assert (b'tab switch' in data) == show_hints, 'persisted bar setting was not applied'
                assert not termios.tcgetattr(slave)[3] & termios.ICANON
                if interrupt:
                    data.clear()
                    # Click Start, then Settings, then the plain wallpaper row.
                    os.write(master, b'\x1b[<0;3;1M\x1b[<0;3;1m')
                    for marker in (b'settings', b'plain'):
                        drain_until(marker)
                        prefix = data[:data.index(marker)]
                        cursor = list(re.finditer(rb'\x1b\[(\d+);(\d+)H', prefix))[-1]
                        row, column = cursor.groups()
                        text = re.sub(rb'\x1b\[[0-9;]*m', b'', prefix[cursor.end():]).decode()
                        data.clear()
                        position = str(int(column) + len(text) + 1).encode() + b';' + row
                        os.write(master, b'\x1b[<0;' + position + b'M\x1b[<0;' + position + b'm')
                    with sqlite3.connect(state) as db:
                        for _ in range(100):
                            row = db.execute("SELECT value FROM exotui_kv WHERE namespace='desktop' AND key='settings'").fetchone()
                            if row and json.loads(row[0]).get('wallpaper') == 'plain':
                                break
                            time.sleep(0.02)
                        else:
                            raise AssertionError('wallpaper change was not committed by the guest')
                    proc.send_signal(signal.SIGTERM)
                else:
                    data.clear()
                    os.write(master, b'\t')
                    drain_until(b'> welcome')
                    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 78, 0, 0))
                    # Resize invalidates the screen and redraws the bottom row.
                    data.clear()
                    drain_until(b'\x1b[24;')
                    os.write(master, b'\x03')
                drain_until(b'\x1b[?1049l')
                assert proc.wait(timeout=10) == 0
                assert termios.tcgetattr(slave) == before, 'terminal flags were not restored'
            finally:
                if proc.poll() is None:
                    proc.kill()
    finally:
        os.close(master)
        os.close(slave)


def check_guest_failure(launcher, component):
    master, slave = pty.openpty()
    before = termios.tcgetattr(slave)
    try:
        proc = subprocess.run([launcher, component, ':memory:'], stdin=slave, stdout=slave, stderr=slave, timeout=35)
        assert proc.returncode != 0, 'intentional guest error did not fail the launcher'
        output = bytearray()
        while select.select([master], [], [], 0)[0]:
            output.extend(os.read(master, 8192))
        assert b'guest failure fixture' in output and b'\x1b[?1049l' in output, output
        assert termios.tcgetattr(slave) == before, 'terminal flags were not restored on guest failure'
    finally:
        os.close(master)
        os.close(slave)


if __name__ == '__main__':
    _, launcher, component, state, failing_component = sys.argv
    check(launcher, component, state, False, True)
    script = os.path.join(os.path.dirname(__file__), 'sqlite_contract.ts')
    subprocess.run(['deno', 'run', '-A', script, state, 'seed'], check=True, timeout=30)
    check(launcher, component, state, True, False)
    subprocess.run([os.environ.get('BUN', 'bun'), 'run', script, state, 'verify'], check=True, timeout=30)
    check_guest_failure(launcher, failing_component)
    print('WASI real PTY: input, resize, SIGTERM, guest failure restoration and SQLite interchange passed')
