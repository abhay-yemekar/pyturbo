"""Small Turbo-style console compatibility module for browser programs."""

import json
import sys

import _pyturbo_bridge as _bridge


def _command(name, *args):
    _bridge.emit(json.dumps({"type": "graphics", "command": "console." + name, "args": list(args)}))


def clrscr():
    _command("clear")


def gotoxy(x, y):
    _command("cursor", max(1, int(x)), max(1, int(y)))


def textcolor(color):
    _command("color", int(color) % 16)


def textbackground(color):
    _command("background", int(color) % 16)


def getch():
    return str(_bridge.getch())


def getche():
    value = getch()
    print(value, end="", flush=True)
    return value


def cprintf(format_string, *args):
    print(format_string % args if args else format_string, end="", flush=True)


def kbhit():
    return bool(_bridge.kbhit())


BLACK, BLUE, GREEN, CYAN, RED, MAGENTA, BROWN, LIGHTGRAY = range(8)
DARKGRAY, LIGHTBLUE, LIGHTGREEN, LIGHTCYAN, LIGHTRED, LIGHTMAGENTA, YELLOW, WHITE = range(8, 16)
