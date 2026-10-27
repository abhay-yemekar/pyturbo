"""BGI-shaped 640x480 drawing API backed by the IDE graphics canvas."""

import json
import _pyturbo_bridge as _bridge

DETECT = 0
BLACK, BLUE, GREEN, CYAN, RED, MAGENTA, BROWN, LIGHTGRAY = range(8)
DARKGRAY, LIGHTBLUE, LIGHTGREEN, LIGHTCYAN, LIGHTRED, LIGHTMAGENTA, YELLOW, WHITE = range(8, 16)
_color = WHITE
_background = BLACK
_x, _y = 0, 0


def _send(command, *args):
    _bridge.emit(json.dumps({"type": "graphics", "command": command, "args": list(args)}))


def initgraph(driver=DETECT, mode=0, path=""):
    _send("init", 640, 480)


def closegraph():
    _send("close")


def cleardevice():
    _send("clear", _background)


def setcolor(color):
    global _color
    _color = int(color) % 16


def setbkcolor(color):
    global _background
    _background = int(color) % 16
    cleardevice()


def line(x1, y1, x2, y2):
    _send("line", x1, y1, x2, y2, _color)


def circle(x, y, radius):
    _send("circle", x, y, radius, _color)


def rectangle(left, top, right, bottom):
    _send("rectangle", left, top, right, bottom, _color)


def bar(left, top, right, bottom):
    _send("bar", left, top, right, bottom, _color)


def putpixel(x, y, color):
    _send("pixel", x, y, int(color) % 16)


def outtextxy(x, y, text):
    _send("text", x, y, str(text), _color)


def moveto(x, y):
    global _x, _y
    _x, _y = x, y


def lineto(x, y):
    line(_x, _y, x, y)
    moveto(x, y)


def getmaxx():
    return 639


def getmaxy():
    return 479


def getcolor():
    return _color


def getbkcolor():
    return _background
