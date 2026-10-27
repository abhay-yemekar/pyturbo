"""A small canvas turtle; coordinates follow Python turtle conventions."""

import math
import graphics as _graphics

_COLORS = {"black": 0, "blue": 1, "green": 2, "cyan": 3, "red": 4,
           "magenta": 5, "brown": 6, "gray": 7, "grey": 7, "white": 15,
           "yellow": 14, "orange": 6, "purple": 5, "pink": 13}
_started = False


class Turtle:
    def __init__(self):
        global _started
        if not _started:
            _graphics.initgraph()
            _started = True
        self._x = 0.0
        self._y = 0.0
        self._heading = 0.0
        self._down = True
        self._color = 15

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        if self._down:
            _graphics.setcolor(self._color)
            _graphics.line(320 + self._x, 240 - self._y, 320 + x, 240 - y)
        self._x, self._y = float(x), float(y)

    def forward(self, distance):
        angle = math.radians(self._heading)
        self.goto(self._x + math.cos(angle) * distance, self._y + math.sin(angle) * distance)

    def backward(self, distance):
        self.forward(-distance)

    def left(self, angle):
        self._heading = (self._heading + angle) % 360

    def right(self, angle):
        self.left(-angle)

    def setheading(self, angle):
        self._heading = float(angle) % 360

    def heading(self):
        return self._heading

    def position(self):
        return self._x, self._y

    def home(self):
        self.goto(0, 0)
        self.setheading(0)

    def penup(self):
        self._down = False

    def pendown(self):
        self._down = True

    def pencolor(self, color=None):
        if color is None:
            return self._color
        self._color = _COLORS.get(str(color).lower(), color if isinstance(color, int) else 15)

    color = pencolor

    def circle(self, radius, extent=360, steps=None):
        steps = steps or max(12, int(abs(extent) / 6))
        angle = extent / steps
        chord = 2 * radius * math.sin(math.radians(angle / 2))
        self.left(angle / 2)
        for _ in range(steps):
            self.forward(chord)
            self.left(angle)
        self.right(angle / 2)

    def dot(self, size=4, color=None):
        _graphics.setcolor(self._color if color is None else _COLORS.get(str(color), 15))
        _graphics.circle(320 + self._x, 240 - self._y, size / 2)

    def write(self, text, **kwargs):
        _graphics.setcolor(self._color)
        _graphics.outtextxy(320 + self._x, 240 - self._y, str(text))

    def clear(self):
        _graphics.cleardevice()

    def reset(self):
        self.clear()
        self.__init__()

    def speed(self, value=None):
        return 0

    def hideturtle(self):
        pass

    def showturtle(self):
        pass

    fd = forward
    bk = backward
    back = backward
    lt = left
    rt = right
    pu = penup
    up = penup
    pd = pendown
    down = pendown
    setpos = goto
    setposition = goto
    pos = position
    ht = hideturtle
    st = showturtle


_default = None


def _turtle():
    global _default
    if _default is None:
        _default = Turtle()
    return _default


def __getattr__(name):
    return getattr(_turtle(), name)


def done():
    pass


def mainloop():
    done()


def bgcolor(color):
    _graphics.setbkcolor(_COLORS.get(str(color).lower(), 0))


def title(text):
    pass


_METHODS = (
    "goto", "forward", "backward", "left", "right", "setheading", "heading",
    "position", "home", "penup", "pendown", "pencolor", "color", "circle",
    "dot", "write", "clear", "reset", "speed", "hideturtle", "showturtle",
    "fd", "bk", "back", "lt", "rt", "pu", "up", "pd", "down", "setpos",
    "setposition", "pos", "ht", "st",
)


def _forward_method(name):
    def method(*args, **kwargs):
        return getattr(_turtle(), name)(*args, **kwargs)
    return method


for _method in _METHODS:
    globals()[_method] = _forward_method(_method)

__all__ = ["Turtle", "done", "mainloop", "bgcolor", "title", *_METHODS]
