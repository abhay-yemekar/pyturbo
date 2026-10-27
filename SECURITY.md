# Security

PyTurbo is under active development. No stable or security-audited release is
claimed. Include the affected commit/version when reporting a problem.

## Reporting

Use the repository's **Security** tab for a private vulnerability report if that
feature is available. If it is unavailable, open an issue requesting a private
reporting channel without revealing the vulnerability. Do not post secrets,
sensitive files, or exploit details affecting other users publicly. The maintainer
is the repository owner, [abhay-yemekar](https://github.com/abhay-yemekar).

Include reproduction steps, browser/OS versions, cross-origin isolation status,
the affected commit, and expected/observed behavior. Use non-sensitive example
files. No response-time guarantee is published.

## Execution and data boundaries

Pyodide runs Python in a Web Worker, keeping it off the UI thread. This is not a
security boundary between arbitrary Python and every capability of the worker's
browser origin. Python can use the JavaScript bridge and supported network APIs;
imported packages execute code too. Inspect untrusted code before running it,
especially on an origin containing files you want to keep private.

There is no server execution or account storage. Files/settings use IndexedDB for
the current origin/profile, and programs receive project files in a virtual
filesystem. Browser storage is not a backup. Fresh run globals do not imply a
new process, fully reset interpreter, or cryptographic isolation from earlier
code. Reset restarts the worker.

Share links contain compressed source in their fragment. Loading opens files
without intentionally running them. Anyone with the full link can read its code;
links may be copied into browser history, messages, or other user-controlled
places. Do not share secrets. The decoder validates schema/paths and limits both
compressed and expanded content.

Live input/debugging require SharedArrayBuffer and COOP/COEP headers. Stop signals
an interrupt and wakes waits, with worker reset as a fallback. Python and package
downloads use the configured runtime/package sources. These controls still need
end-to-end and deployment verification.

## Contributor requirements

Never commit credentials, private browser state, personal files, or proprietary
reference assets. Do not weaken headers or checks to hide a runtime failure.
Keep dependencies pinned, investigate security findings, and test accepted and
rejected input paths for security-sensitive changes.
