"""Line debugger using CPython's monitoring API and a synchronous shared mailbox."""

import json
import sys

import _pyturbo_bridge as bridge


def _display(value):
    try:
        text = repr(value)
    except BaseException as error:
        text = "<repr failed: " + type(error).__name__ + ">"
    return text[:400] + ("…" if len(text) > 400 else "")


class Debugger:
    def __init__(self, filename, options):
        self.filename = filename
        self.breakpoints = set(options.get("breakpoints", []))
        self.mode = options.get("mode", "into")
        self.cursor = options.get("cursor")
        self.watches = options.get("watches", [])
        self.depth = 0
        self.tool = None

    def start(self):
        for candidate in range(6):
            if sys.monitoring.get_tool(candidate) is None:
                self.tool = candidate
                break
        if self.tool is None:
            raise RuntimeError("No Python monitoring tool slot is available")
        sys.monitoring.use_tool_id(self.tool, "PyTurbo debugger")
        sys.monitoring.register_callback(self.tool, sys.monitoring.events.LINE, self.line)
        sys.monitoring.set_events(self.tool, sys.monitoring.events.LINE)

    def close(self):
        if self.tool is not None:
            sys.monitoring.set_events(self.tool, 0)
            sys.monitoring.free_tool_id(self.tool)
            self.tool = None

    def _stack(self, frame):
        result = []
        while frame is not None:
            if frame.f_code.co_filename.startswith("/pyturbo/project/"):
                result.append({
                    "filename": frame.f_code.co_filename.removeprefix("/pyturbo/project/"),
                    "line": frame.f_lineno,
                    "name": frame.f_code.co_name,
                })
            frame = frame.f_back
        return result

    def _evaluate(self, expression, frame):
        try:
            return _display(eval(expression, frame.f_globals, frame.f_locals))
        except BaseException as error:
            return type(error).__name__ + ": " + str(error)

    def line(self, code, line):
        if not code.co_filename.startswith("/pyturbo/project/"):
            return
        frame = sys._getframe(1)
        stack = self._stack(frame)
        at_breakpoint = code.co_filename == self.filename and line in self.breakpoints
        at_cursor = code.co_filename == self.filename and line == self.cursor
        should_pause = (
            at_breakpoint
            or self.mode == "into"
            or (self.mode == "over" and len(stack) <= self.depth)
            or (self.mode == "cursor" and at_cursor)
        )
        if not should_pause:
            return
        while True:
            state = {
                "type": "paused",
                "filename": code.co_filename.removeprefix("/pyturbo/project/"),
                "line": line,
                "locals": {str(k): _display(v) for k, v in list(frame.f_locals.items())[:200]
                           if not str(k).startswith("__")},
                "stack": stack[:40],
                "watches": {expression: self._evaluate(expression, frame) for expression in self.watches},
            }
            command = json.loads(str(bridge.debug_pause(json.dumps(state))))
            action = command.get("command", "continue")
            if action == "evaluate":
                expression = command.get("expression", "")
                if command.get("modify"):
                    try:
                        exec(expression, frame.f_globals, frame.f_locals)
                        value = "(modified)"
                    except BaseException as error:
                        value = type(error).__name__ + ": " + str(error)
                else:
                    value = self._evaluate(expression, frame)
                bridge.emit(json.dumps({"type": "evaluated", "expression": expression, "value": value}))
                continue
            if action == "watches":
                self.watches = command.get("watches", [])
                continue
            self.mode = action
            self.cursor = command.get("cursor", self.cursor)
            self.depth = len(stack)
            if "breakpoints" in command:
                self.breakpoints = set(command["breakpoints"])
            return
