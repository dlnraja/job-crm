import { h, svg } from "./dom";

export function donutFigure(
  title: string,
  slices: Array<{ label: string; count: number; color: string }>,
): HTMLElement {
  const figure = h("figure", { class: "chart" }, [h("figcaption", { text: title })]);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (!total) {
    figure.append(h("p", { class: "muted", text: "Aucune donnée." }));
    return figure;
  }
  const graphic = svg("svg", { viewBox: "0 0 120 120", class: "donut", role: "img" });
  graphic.setAttribute("aria-label", slices.map((slice) => `${slice.label} ${slice.count}`).join(", "));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  if (slices.length === 1) {
    graphic.append(
      svg("circle", {
        cx: "60",
        cy: "60",
        r: String(radius),
        fill: "none",
        stroke: slices[0].color,
        "stroke-width": "14",
      }),
    );
  } else {
    let offset = 0;
    for (const slice of slices) {
      const length = (slice.count / total) * circumference;
      const circle = svg("circle", {
        cx: "60",
        cy: "60",
        r: String(radius),
        fill: "none",
        stroke: slice.color,
        "stroke-width": "14",
        "stroke-dasharray": `${length} ${circumference - length}`,
        "stroke-dashoffset": String(-offset),
      });
      circle.setAttribute("transform", "rotate(-90 60 60)");
      graphic.append(circle);
      offset += length;
    }
  }
  graphic.append(
    svg("text", {
      x: "60",
      y: "64",
      "text-anchor": "middle",
      class: "donut-total",
    }),
  );
  graphic.querySelector("text")!.textContent = String(total);
  const legend = h("ul", { class: "legend" });
  for (const slice of slices) {
    const swatch = h("i");
    swatch.style.background = slice.color;
    legend.append(h("li", {}, [swatch, h("span", { text: `${slice.label} · ${slice.count}` })]));
  }
  figure.append(h("div", { class: "chart-body" }, [graphic, legend]));
  return figure;
}

export function barFigure(
  title: string,
  rows: Array<{ label: string; count: number; color?: string }>,
): HTMLElement {
  const figure = h("figure", { class: "chart" }, [h("figcaption", { text: title })]);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const list = h("ul", { class: "bars" });
  for (const row of rows) {
    const fill = h("span", { class: "bar-fill" });
    fill.style.width = `${Math.round((row.count / max) * 100)}%`;
    if (row.color) fill.style.background = row.color;
    list.append(
      h("li", {}, [
        h("span", { class: "bar-label", text: row.label }),
        h("span", { class: "bar-track" }, [fill]),
        h("span", { class: "bar-value", text: String(row.count) }),
      ]),
    );
  }
  figure.append(list);
  return figure;
}
