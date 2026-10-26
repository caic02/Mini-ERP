import { InputHTMLAttributes, useLayoutEffect, useRef, useState } from "react";
import { formatCurrencyInput, parseCurrencyInput } from "./currency";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
  allowNegative?: boolean;
};
export function CurrencyInput({
  value,
  onValueChange,
  allowNegative = false,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current != null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  return (
    <input
      {...props}
      ref={input}
      type="text"
      inputMode="decimal"
      value={focused ? draft : formatCurrencyInput(value)}
      onFocus={(e) => {
        setDraft(formatCurrencyInput(value));
        setFocused(true);
        if (/^0(?:\.0{1,2})?$/.test(String(value))) e.currentTarget.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value,
          cursor = e.target.selectionStart || 0;
        const event = e.nativeEvent as InputEvent;
        const editing =
          event.inputType?.startsWith("delete") || event.data?.length === 1;
        const previous = focused ? draft : formatCurrencyInput(value);
        const text =
          editing &&
          (raw.includes(",") ||
            (previous.includes(".") &&
              raw.split(".").length <= previous.split(".").length))
            ? raw.replace(/\./g, "")
            : raw;
        const parsed = parseCurrencyInput(text, allowNegative);
        if (!parsed) return;
        let position = parsed.display.length;
        if (cursor < raw.length) {
          const digits = raw.slice(0, cursor).replace(/\D/g, "").length;
          position = 0;
          let count = 0;
          while (position < parsed.display.length && count < digits) {
            if (/\d/.test(parsed.display[position])) count++;
            position++;
          }
        }
        caret.current = position;
        setDraft(parsed.display);
        onValueChange(parsed.value);
      }}
    />
  );
}
