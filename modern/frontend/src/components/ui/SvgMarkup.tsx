import { createElement, type ReactNode } from "react";

// Converts the static SVG child markup kept from the legacy icon tables (e.g. '<path d="…"/><circle …/>') into real
// React elements, so icons render natively instead of through innerHTML. Parsed once per string and cached.
const cache = new Map<string, ReactNode[]>();
const prop = (name: string) => (name === "class" ? "className" : name.startsWith("aria-") || name.startsWith("data-") ? name : name.replace(/[-:]([a-z])/g, (_, c: string) => c.toUpperCase()));

function convert(node: Element, key: number): ReactNode {
  const props: Record<string, unknown> = { key };
  for (const a of Array.from(node.attributes)) {
    if (a.name === "style") props.style = Object.fromEntries(a.value.split(";").filter(Boolean).map((d) => { const [k, ...v] = d.split(":"); return [prop(k.trim()), v.join(":").trim()]; }));
    else props[prop(a.name)] = a.value;
  }
  const kids: ReactNode[] = [];
  node.childNodes.forEach((c, i) => {
    if (c.nodeType === 1) kids.push(convert(c as Element, i));
    else if (c.nodeType === 3 && c.textContent?.trim()) kids.push(c.textContent);
  });
  return createElement(node.localName, props, ...kids);
}

export function svgNodes(markup: string | undefined): ReactNode[] {
  if (!markup) return [];
  const hit = cache.get(markup);
  if (hit) return hit;
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml");
  const out = doc.querySelector("parsererror") ? [] : Array.from(doc.documentElement.children).map((c, i) => convert(c, i));
  cache.set(markup, out);
  return out;
}

/** Inline SVG fragment (a full `<svg …>…</svg>` string) as React elements. */
export function svgElement(markup: string, extra?: Record<string, unknown>): ReactNode {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (doc.querySelector("parsererror")) return null;
  const el = convert(doc.documentElement, 0) as React.ReactElement;
  return extra ? createElement(el.type, { ...(el.props as object), ...extra }) : el;
}
