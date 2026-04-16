const h = ctx.React.createElement;
const r = ctx.record || {};
const statusMap = {
  "在库":     { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  "使用中":   { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  "维修中":   { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
  "保养中":   { bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" },
  "已报废":   { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
};
const st = statusMap[r.status] || { bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb" };
ctx.render(h("div", { style: { lineHeight: "20px", background: st.bg, border: "1px solid " + st.border, borderRadius: 6, padding: "6px 10px", margin: "-4px 0" } }, [
  h("div", { key: "m", style: { fontWeight: 500, color: "#1890ff", fontSize: 13 } }, r.name || "-"),
  h("div", { key: "s", style: { fontSize: 11, display: "flex", alignItems: "center", gap: 6, marginTop: 2 } }, [
    h("span", { key: "c", style: { color: "#999" } }, r.category_rel?.name || "-"),
    h("span", { key: "d", style: { color: "#ddd" } }, "·"),
    h("span", { key: "st", style: { color: st.color, fontWeight: 500 } }, r.status || "-"),
  ]),
]));