# Desktop scroll polish

A fast touch swipe coasts on the existing desktop animation clock, with bounded distance and cancellation after a pause,
competing input, focus change, or reduced-motion preference. The painted scrollbar geometry also drives click/tap
seeking without activating content underneath. Browser mail links target a separate browsing context.

Sessions and Network used to switch between a fallback and a cached widget snapshot during scroll. One viewport painter
now paints the rows and scrollbar in both the first and settled frames. Files shares the tree renderer. Mounted tests
also pin bottom-row hit-testing.

Compare the focused window's local size with the daemon's reported PTY size on focus. Passive updates must not resize a
PTY back and forth between two viewers.

Ctrl+C and Ctrl+Shift+C copy highlighted terminal output and otherwise pass the original key to the child. The terminal
context menu preserves the selection for Copy. Paste reads bounded plain text on the viewer and honors bracketed paste.
Cut is unavailable for read-only output. Native clipboard delivery and physical-phone feel were not verified.

The fixes are integrated into the normal source checkout so `./install-exomux.sh` builds the standard `exomux`
executable. Do not install a separate client or replace the user's installed binary to validate a source-only change.
