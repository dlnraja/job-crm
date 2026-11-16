type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | null | undefined>;
  on?: Record<string, EventListener>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text != null) node.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value != null) node.setAttribute(key, value);
    }
  }
  if (props.on) {
    for (const [type, listener] of Object.entries(props.on)) node.addEventListener(type, listener);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

export function svg(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)} %`;
}

export function gmailHref(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`;
}

export function externalLink(href: string, text: string): HTMLAnchorElement {
  return h("a", {
    class: "text-link",
    text,
    attrs: { href, target: "_blank", rel: "noreferrer noopener" },
  });
}

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  return h("label", { class: "field" }, [h("span", { text: label }), control]);
}
