import { parser } from '@lezer/python';

const keywords = new Set(
  'def class if elif else for while return import from as with try except finally raise lambda yield pass break continue in is not and or None True False global nonlocal assert del async await match case type'.split(
    ' ',
  ),
);

export type PythonTokenRole =
  | 'normal'
  | 'comment'
  | 'reserved'
  | 'identifier'
  | 'symbol'
  | 'string'
  | 'integer'
  | 'float'
  | 'octal'
  | 'hex'
  | 'preprocessor'
  | 'illegal';

export const PYTHON_TOKEN_ATTRIBUTES: Record<PythonTokenRole, number> = {
  normal: 0x1e,
  comment: 0x13,
  reserved: 0x1f,
  identifier: 0x1a,
  symbol: 0x1e,
  string: 0x14,
  integer: 0x17,
  float: 0x16,
  octal: 0x18,
  hex: 0x10,
  preprocessor: 0x31,
  illegal: 0x40,
};

/** Semantic roles are retained even where factory attributes share a value. */
export function pythonTokenRoles(source: string): PythonTokenRole[] {
  const roles = Array<PythonTokenRole>(source.length).fill('normal');
  const preprocessor: Array<{ from: number; to: number }> = [];
  const errors: Array<{ from: number; to: number }> = [];
  const paint = (from: number, to: number, role: PythonTokenRole) => {
    for (let i = from; i < Math.min(to, roles.length); i++) roles[i] = role;
  };
  parser.parse(source).iterate({
    enter(node) {
      const { name, from, to, type } = node;
      if (name === 'ImportStatement' || name === 'Decorator') {
        const lineStart = source.lastIndexOf('\n', from - 1) + 1;
        const end = source.indexOf('\n', Math.max(from, to - 1));
        preprocessor.push({ from: lineStart, to: end < 0 ? source.length : end });
      }
      if (name === 'Comment') {
        paint(from, to, 'comment');
        return false;
      }
      if (name === 'String' || name === 'FormatString') {
        paint(from, to, 'string');
        const cursor = node.node.cursor();
        do {
          if (cursor.type.isError) {
            errors.push({ from, to });
            break;
          }
        } while (cursor.next());
        return false;
      }
      if (name === 'Number') {
        const value = source.slice(from, to).replaceAll('_', '').toLowerCase();
        const role = value.startsWith('0x')
          ? 'hex'
          : /^0[ob]/.test(value)
            ? 'octal'
            : /[.ej]/.test(value)
              ? 'float'
              : 'integer';
        paint(from, to, role);
        return false;
      }
      if (name === 'VariableName' || name === 'PropertyName') {
        paint(from, to, 'identifier');
        return false;
      }
      if (name === 'Boolean' || keywords.has(name)) paint(from, to, 'reserved');
      else if (
        !node.node.firstChild &&
        /^[()[\]{}:,.=+\-*/%<>!&|^~@;]+$/.test(source.slice(from, to))
      ) {
        paint(from, to, 'symbol');
      }
      if (type.isError && to > from) errors.push({ from, to });
      return undefined;
    },
  });
  // A preprocessor line is a single colour group, including comments and strings.
  for (const { from, to } of preprocessor) paint(from, to, 'preprocessor');
  for (const { from, to } of errors) paint(from, to, 'illegal');
  return roles;
}

/** Attribute bytes for every UTF-16 code unit, using the factory Turbo colours. */
export function pythonAttributes(source: string, identifierAttr = 0x1a): number[] {
  return pythonTokenRoles(source).map((role) =>
    role === 'identifier' ? identifierAttr : PYTHON_TOKEN_ATTRIBUTES[role],
  );
}
