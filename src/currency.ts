const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export function formatCurrencyInput(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return String(value);
  return match[1] + group(match[2]) + "," + (match[3] || "").padEnd(2, "0");
}
// Strings decimais na API; nunca converte moeda para ponto flutuante.
export function parseCurrencyInput(
  input: string,
  negative = false,
): { value: string; display: string } | null {
  let text = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (text === "") return { value: "", display: "" };
  const sign = text.startsWith("-") ? "-" : "";
  if (sign && !negative) return null;
  if (sign) text = text.slice(1);
  if (!text && sign) return { value: "", display: "-" };
  if (!/^[\d.,]+$/.test(text)) return null;
  let whole = text,
    fraction = "",
    decimal = false;
  if (text.includes(",")) {
    if (text.split(",").length !== 2) return null;
    [whole, fraction] = text.split(",");
    decimal = true;
  } else if (text.includes(".") && !/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    const index = text.lastIndexOf(".");
    whole = text.slice(0, index);
    fraction = text.slice(index + 1);
    decimal = true;
  }
  if (!/^\d*(?:\.\d{3})*$/.test(whole) && !/^\d+$/.test(whole)) return null;
  if (!/^\d{0,2}$/.test(fraction)) return null;
  whole = whole.replace(/\./g, "").replace(/^0+(?=\d)/, "") || "0";
  return {
    value: sign + whole + "." + fraction.padEnd(2, "0"),
    display: sign + group(whole) + (decimal ? "," + fraction : ""),
  };
}
