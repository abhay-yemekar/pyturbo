# Editor and browser storage

The editor works before Python loads. `EditorBuffer` stores source as a UTF-16 string and
normalizes imported CRLF and CR newlines to LF. Positions returned by `position` and `goto`
are zero based. The host displays one-based line and column numbers.

## Editing and keys

Arrow keys, Home/End, Page Up/Page Down, Shift+movement, Backspace/Delete, Insert, Enter,
Tab, and Shift+Tab are implemented. Vertical movement remembers the preferred column
through shorter lines. Enter copies leading indentation and adds one indentation level
after a colon. Tab inserts spaces up to the next configured tab stop; Shift+Tab removes
one indentation level. Insert switches between insertion and overwrite. Overwrite never
consumes a newline. Surrogate pairs move and delete together.

Undo/redo keeps up to 200 edit snapshots. A saved-content marker determines whether the
current buffer is modified, including after undoing back to the saved version. Saving uses
`markSaved()` and preserves undo history. Loading via `setText()` clears that history.

| Keys                                | Implemented behavior                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Ctrl+Z / Ctrl+Shift+Z               | Undo / redo when CUA keys are enabled                                             |
| Alt+Backspace / Shift+Alt+Backspace | Undo / redo                                                                       |
| Ctrl+A                              | Select all when CUA keys are enabled                                              |
| Ctrl+Left/Right                     | Move by word, with Shift extending selection                                      |
| Ctrl+Home/End                       | Go to the first/last line of the editor viewport, following the Turbo command set |
| Ctrl+Page Up/Down                   | Go to the start/end of the file                                                   |
| Ctrl+K B / K                        | Mark block beginning / end; a marked block stays fixed while the cursor moves     |
| Ctrl+K H / T / L                    | Hide/show marked block / select word / select line                                |
| Ctrl+K C / V / Y                    | Copy / move / delete the marked block                                             |
| Ctrl+K I / U                        | Indent / unindent selected lines                                                  |
| Ctrl+K 0–9, Ctrl+Q 0–9              | Set / jump to a bookmark                                                          |
| Ctrl+Q S / D / R / C                | Start/end of line / start/end of file                                             |
| Ctrl+Q E / X / P                    | Viewport top/bottom / previous cursor position                                    |
| Ctrl+Q B / K                        | Jump to marked block beginning/end                                                |
| Ctrl+Q [ or ]                       | Match nested brackets; this scan is textual, including strings/comments           |
| Ctrl+Y / Ctrl+Q Y                   | Delete line / delete to end of line                                               |
| Ctrl+T / Ctrl+N                     | Delete next word / insert an empty line                                           |
| Ctrl+L                              | Repeat the last search                                                            |
| Ctrl+O I                            | Toggle auto-indent in this buffer                                                 |

The legacy movement aliases Ctrl+S/D/E/X, Ctrl+F/A, Ctrl+W/Z, Ctrl+R/C, Ctrl+G/H, and
Ctrl+V work where they do not conflict with enabled CUA shortcuts. Ctrl+A/C/X/V/Z belong
to their CUA actions by default; disabling CUA keys restores those WordStar aliases.
The application handles browser clipboard reads/writes, including Ctrl+C/X/V,
Ctrl+Insert, Shift+Delete, and Shift+Insert. The buffer does not request clipboard access.

Some sequences emit `pendingCommand` for the application to present the corresponding
UI: Ctrl+Q F/A (find/replace), Ctrl+K S/D (save/menu), and Ctrl+K R/W/P
(read block/write block/print). An emitted command is not proof that the host implements
that dialog or operation. Literal search supports case sensitivity, direction, wrapping,
and a starting offset. Replace-all is a single undoable edit and treats replacement text
literally, including `$` characters.

The plan lists Ctrl+O T/U/F/R as tab mode, unindent, optimal fill, and cursor-through-tabs
toggles, but does not specify their detailed Turbo behavior. These four toggles remain
unimplemented pending reference verification. No alternative tab/fill behavior is silently
assigned to them. Fixed 19-line page/viewport key distances also need adaptation by the
host for 43/50-line or Fill layouts. Bookmarks and undo history are session state, not
persisted file metadata. Unicode grapheme clusters beyond surrogate pairs are not yet
treated as indivisible cursor units.

## Syntax colors

`pythonAttributes()` uses the Lezer Python grammar and returns a VGA attribute for every
UTF-16 code unit. It maps comments, reserved words, names, strings (including prefixed and
multiline strings), integer/float/octal/binary/hex literals, and invalid tokens to the
plan's factory colors. Imports and decorator lines receive the preprocessor color;
invalid tokens take precedence. An unterminated string receives the illegal-character
attribute. F-string contents use the string group. The identifier attribute can be
overridden for the Classic Yellow preset. This helper currently parses the whole document
on each call; incremental parser fragment reuse is not yet implemented.

## Persistent files and settings

`WorkspaceStore` uses IndexedDB through `idb-keyval`, in database `pyturbo`, object store
`workspace`. Each file has `{ name, content, updatedAt }` and a separate `file:` key.
Settings use the `settings` key. `saveFiles()` writes its batch atomically. Storage failures
reject the operation so the host can preserve the unsaved in-memory buffer and show an
error. There is no claimed durable fallback when IndexedDB is unavailable.

Names must be relative project paths. Absolute paths, drive letters, backslashes, control
characters, empty path segments, and `.`/`..` segments are rejected. Unicode names and
project subdirectories are accepted. This protects the boundary when files are passed
to the Python worker's filesystem. `loadFiles()` validates persisted records rather than
trusting hand-edited or stale database data.

Settings default to Exact 80×25, green identifiers, pause after run off, color video mode,
four-space tabs, auto-indent, and CUA shortcuts. Settings include arguments, per-role
colors, and desktop window bounds. Stored settings are validated; unsupported values
fall back to the agreed defaults. File content, bookmarks, breakpoints, and undo history
are not embedded inside settings.

Browser storage belongs to the current origin and browser profile. It can be cleared by
the browser, private mode, or the user. Download important files for a separate copy.

## Share links

`encodeShare(files, activeFile)` returns `#pyturbo=…`, using lz-string URI compression.
`decodeShare(fragment)` returns `{ files: Record<string, string>, activeFile }`, or `null`
for an unrelated fragment. The schema is versioned. Loading a share link does not save
or overwrite IndexedDB files; that is a separate, explicit application operation.

Share content stays in the URL fragment and is not uploaded to a sharing service. Anyone
given the link can read it. Validation bounds the fragment to 16,000 characters, project
source plus filenames to 256,000 UTF-16 code units, and the project to 100 files. Oversized
projects report an error and direct the user to downloads. The active filename must
exist. A bounded decoder stops oversized decompression before an untrusted compressed
link can allocate unlimited output; decoded JSON and every filename are then validated.

The share decoder is compatible with lz-string 1.5's URI bitstream. The unit suite includes
Unicode, escaped JSON, corrupt/truncated payloads, traversal, missing files, and a small
compressed expansion fixture. Browser-specific URL limits still require end-to-end checks.
