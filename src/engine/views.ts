import type { CellBuffer, Rect } from './cell-buffer';

export type ViewEvent =
  | { type: 'key'; key: string; alt?: boolean; ctrl?: boolean; shift?: boolean }
  | { type: 'pointer'; x: number; y: number; action: 'down' | 'up' | 'move' };

/** Bounds are absolute cell coordinates; groups paint children back to front. */
export class View {
  visible = true;
  focused = false;
  enabled = true;

  constructor(public bounds: Rect) {}

  contains(x: number, y: number): boolean {
    const { bounds } = this;
    return x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.w && y < bounds.y + bounds.h;
  }

  draw(_buffer: CellBuffer): void {}

  handle(_event: ViewEvent): boolean {
    return false;
  }
}

export class Group extends View {
  readonly children: View[] = [];

  add<T extends View>(view: T): T {
    this.children.push(view);
    return view;
  }

  remove(view: View): void {
    const index = this.children.indexOf(view);
    if (index >= 0) this.children.splice(index, 1);
  }

  override draw(buffer: CellBuffer): void {
    for (const child of this.children) if (child.visible) child.draw(buffer);
  }

  override handle(event: ViewEvent): boolean {
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];
      if (!child?.visible || !child.enabled) continue;
      if (event.type === 'pointer' && !child.contains(event.x, event.y)) continue;
      if (event.type === 'key' && !child.focused) continue;
      if (child.handle(event)) return true;
    }
    return false;
  }
}

export class Window extends Group {
  active = true;
  shadow = true;
  windowNumber: number | undefined;
  background = 0x1e;
  border = 0x1f;

  constructor(
    bounds: Rect,
    public title: string,
  ) {
    super(bounds);
  }

  override draw(buffer: CellBuffer): void {
    const { x, y, w, h } = this.bounds;
    buffer.fill(x, y, w, h, ' ', this.background);
    buffer.box(x, y, w, h, this.active, this.active ? this.border : 0x17);
    const title = ` ${this.title} `.slice(0, Math.max(0, w - 12));
    buffer.text(x + Math.floor((w - title.length) / 2), y, title, this.active ? this.border : 0x17);
    if (this.active) {
      buffer.text(x + 2, y, '[■]', this.border);
      buffer.set(x + 3, y, '■', 0x1a);
      buffer.text(x + w - 5, y, '[↑]', this.border);
      buffer.set(x + w - 4, y, '↑', 0x1a);
    }
    if (this.windowNumber !== undefined)
      buffer.text(x + w - 7, y, String(this.windowNumber), this.border);
    super.draw(buffer);
    if (this.shadow) buffer.shadow(x, y, w, h);
  }
}

export class Dialog extends Group {
  constructor(
    bounds: Rect,
    public title: string,
  ) {
    super(bounds);
  }

  override draw(buffer: CellBuffer): void {
    const { x, y, w, h } = this.bounds;
    buffer.fill(x, y, w, h, ' ', 0x70);
    buffer.box(x, y, w, h, true, 0x7f);
    const title = ` ${this.title} `.slice(0, Math.max(0, w - 8));
    buffer.text(x + Math.floor((w - title.length) / 2), y, title, 0x7f);
    buffer.text(x + 2, y, '[■]', 0x7f);
    buffer.set(x + 3, y, '■', 0x7a);
    super.draw(buffer);
    buffer.shadow(x, y, w, h);
  }
}

export class Label extends View {
  constructor(
    bounds: Rect,
    public text: string,
    public attr = 0x70,
  ) {
    super(bounds);
  }

  override draw(buffer: CellBuffer): void {
    buffer.text(this.bounds.x, this.bounds.y, this.text.slice(0, this.bounds.w), this.attr);
  }
}

export class Button extends View {
  constructor(
    bounds: Rect,
    public label: string,
    public onPress: () => void,
  ) {
    super(bounds);
  }

  override draw(buffer: CellBuffer): void {
    const { x, y, w } = this.bounds;
    buffer.fill(x, y, w, 1, ' ', this.enabled ? (this.focused ? 0x2f : 0x20) : 0x78);
    buffer.text(
      x + Math.max(0, Math.floor((w - this.label.length) / 2)),
      y,
      this.label.slice(0, w),
      this.enabled ? (this.focused ? 0x2f : 0x20) : 0x78,
    );
    buffer.set(x + w, y, '▄', 0x70);
    buffer.fill(x + 1, y + 1, w, 1, '▀', 0x70);
  }

  override handle(event: ViewEvent): boolean {
    if (!this.enabled) return false;
    if (
      (event.type === 'key' && (event.key === 'Enter' || event.key === ' ')) ||
      (event.type === 'pointer' && event.action === 'up' && this.contains(event.x, event.y))
    ) {
      this.onPress();
      return true;
    }
    return false;
  }
}

export class InputLine extends View {
  value = '';

  override draw(buffer: CellBuffer): void {
    const { x, y, w } = this.bounds;
    buffer.fill(x, y, w, 1, ' ', 0x1f);
    buffer.text(x, y, this.value.slice(-w), 0x1f);
  }
}

export class ListBox extends View {
  selected = 0;
  items: string[] = [];

  override draw(buffer: CellBuffer): void {
    const { x, y, w, h } = this.bounds;
    buffer.fill(x, y, w, h, ' ', 0x30);
    for (let row = 0; row < Math.min(h, this.items.length); row++) {
      const attr = row === this.selected ? (this.focused ? 0x2f : 0x3e) : 0x30;
      buffer.fill(x, y + row, w, 1, ' ', attr);
      buffer.text(x, y + row, (this.items[row] ?? '').slice(0, w), attr);
    }
  }
}
