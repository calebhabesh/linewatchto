/**
 * A small SVG reader for asset checks: elements with their attributes,
 * children and text, enough for Inkscape files. Not a general XML parser
 * (no DTDs or entities beyond the five predefined ones).
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name] ?? match;
  });
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = decode(match[3] ?? match[4] ?? "");
  }
  return attributes;
}

/** Parses SVG markup into a tree of `{ tag, attributes, children, parent, text }`. */
export function parseSvg(markup) {
  const document = { tag: "#document", attributes: {}, children: [], parent: null, text: "" };
  let current = document;
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>|([^<]+)/gi;
  for (const match of markup.matchAll(token)) {
    const [, cdata, closeTag, openTag, attributeSource, selfClosing, text] = match;
    if (cdata !== undefined) current.text += cdata;
    else if (text !== undefined) current.text += decode(text);
    else if (closeTag !== undefined) {
      if (current.tag !== closeTag) throw new Error(`Unbalanced </${closeTag}> inside <${current.tag}>`);
      current = current.parent;
    } else if (openTag !== undefined) {
      const element = { tag: openTag, attributes: parseAttributes(attributeSource), children: [], parent: current, text: "" };
      current.children.push(element);
      if (!selfClosing) current = element;
    }
  }
  if (current !== document) throw new Error(`Unclosed <${current.tag}>`);
  return document;
}

export function* descendants(element) {
  for (const child of element.children) {
    yield child;
    yield* descendants(child);
  }
}

/** The element's text, including its descendants', with whitespace collapsed. */
export function textContent(element) {
  const parts = [element.text];
  for (const child of descendants(element)) parts.push(child.text);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The first element matching a simple selector: `#id`, `tag`, or
 * `[attribute='value']` (with `\:` for a namespace colon).
 */
export function querySelector(root, selector) {
  const id = /^#([\w-]+)$/.exec(selector);
  const attribute = /^\[([\w\\:-]+)=['"]([^'"]*)['"]\]$/.exec(selector);
  if (!id && !attribute && !/^[\w:-]+$/.test(selector)) throw new Error(`Unsupported selector: ${selector}`);
  for (const element of descendants(root)) {
    if (id && element.attributes.id === id[1]) return element;
    if (attribute && element.attributes[attribute[1].replace(/\\/g, "")] === attribute[2]) return element;
    if (!id && !attribute && element.tag === selector) return element;
  }
  return null;
}
