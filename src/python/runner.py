"""Internal project lifecycle, kept outside the user's namespace."""

import importlib
import code
import codeop
import io
import json
import linecache
import os
import sys
import traceback
import warnings

from _pyturbo_debugger import Debugger

ROOT = "/pyturbo/project/"
_console = code.InteractiveConsole({"__name__": "__console__"}, filename="<PyTurbo shell>")


def repl_imports(source):
    combined = "\n".join(_console.buffer + [source])
    try:
        return combined if codeop.compile_command(combined, "<PyTurbo shell>") else ""
    except (SyntaxError, OverflowError, ValueError):
        return ""


def repl(source):
    try:
        more = _console.push(source)
        return json.dumps({"more": more})
    except BaseException as error:
        _console.resetbuffer()
        print(type(error).__name__ + (": " + str(error) if str(error) else ""), file=sys.stderr)
        return json.dumps({"more": False})


def diagnostic(error, filename):
    if isinstance(error, SyntaxError):
        return {
            "filename": (error.filename or filename).removeprefix(ROOT),
            "line": error.lineno or 1,
            "column": error.offset or 1,
            "message": type(error).__name__ + ": " + (error.msg or str(error)),
            "severity": "error",
        }
    frames = traceback.extract_tb(error.__traceback__)
    frame = next((item for item in reversed(frames) if item.filename.startswith(ROOT)), None)
    return {
        "filename": frame.filename.removeprefix(ROOT) if frame else filename,
        "line": frame.lineno if frame else 1,
        "column": (frame.colno + 1) if frame and frame.colno is not None else 1,
        "message": type(error).__name__ + (": " + str(error) if str(error) else ""),
        "severity": "error",
    }


def check(files_json, filename, all_files):
    files = json.loads(files_json)
    entries = []
    count = 0
    for name, source in files.items():
        if not name.lower().endswith(".py") or (not all_files and name != filename):
            continue
        count += len(source.splitlines())
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            try:
                compile(source, ROOT + name, "exec")
            except BaseException as error:
                entries.append(diagnostic(error, name))
            for warning in captured:
                entries.append({
                    "filename": name, "line": warning.lineno, "column": 1,
                    "message": warning.category.__name__ + ": " + str(warning.message),
                    "severity": "warning",
                })
    return json.dumps({
        "type": "compiled",
        "ok": not any(entry["severity"] == "error" for entry in entries),
        "lines": count,
        "warnings": sum(entry["severity"] == "warning" for entry in entries),
        "entries": entries,
    })


def run(filename, args_json, debug_json):
    path = ROOT + filename
    args = json.loads(args_json)
    options = json.loads(debug_json)
    old_argv = sys.argv
    old_path = sys.path[:]
    old_cwd = os.getcwd()
    old_stdout, old_stderr, old_stdin = sys.stdout, sys.stderr, sys.stdin
    debugger = None
    try:
        for name, module in list(sys.modules.items()):
            if (str(getattr(module, "__file__", "")).replace("\\", "/").startswith(ROOT)
                    or name in ("conio", "graphics", "turtle")):
                del sys.modules[name]
        importlib.invalidate_caches()
        linecache.clearcache()
        sys.dont_write_bytecode = True
        sys.argv = [filename] + args
        if ROOT.rstrip("/") not in sys.path:
            sys.path.insert(0, ROOT.rstrip("/"))
        os.chdir(ROOT)
        namespace = {"__name__": "__main__", "__file__": path, "__package__": None}
        with open(path, encoding="utf-8") as source_file:
            code = compile(source_file.read(), path, "exec")
        if options:
            debugger = Debugger(path, options)
            debugger.start()
        exec(code, namespace, namespace)
        # Render pyplot without relying on a DOM in the worker.
        if "matplotlib.pyplot" in sys.modules:
            import base64
            import _pyturbo_bridge as bridge
            pyplot = sys.modules["matplotlib.pyplot"]
            for number in pyplot.get_fignums():
                output = io.BytesIO()
                pyplot.figure(number).savefig(output, format="png")
                bridge.emit(json.dumps({"type": "plot", "data": "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()}))
            pyplot.close("all")
        return json.dumps({"ok": True})
    except SystemExit as error:
        if error.code is None or error.code == 0:
            return json.dumps({"ok": True})
        return json.dumps({"ok": False, "entries": [diagnostic(error, filename)], "text": str(error)})
    except BaseException as error:
        return json.dumps({"ok": False, "entries": [diagnostic(error, filename)], "text": "".join(traceback.format_exception(error))})
    finally:
        if debugger:
            debugger.close()
        # CPython may still buffer output from print(..., end=""). Flush it
        # before the worker reports completion and displays the pause hint.
        for stream in (old_stdout, old_stderr):
            try:
                stream.flush()
            except (OSError, ValueError):
                pass
        sys.argv = old_argv
        sys.path[:] = old_path
        sys.stdout, sys.stderr, sys.stdin = old_stdout, old_stderr, old_stdin
        os.chdir(old_cwd)
