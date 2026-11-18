# Codex resize cursor report

The field screenshots show stale Codex content at two different wrapping widths inside the same Exomux window. A private
PTY running the installed Codex emitted a cursor position request (`CSI 6 n`) after a width change. Exomux silently
dropped it. The controller regression failed on the missing response and passes when the embedded screen reports its
cursor back to the originating session. Replayed history must not send replies. The original sustained oscillation was
not reproduced with the isolated startup session; the missing response is verified, but its role in the field symptom is
not yet confirmed. Do not restart or probe the maintainer's live session with test input.
