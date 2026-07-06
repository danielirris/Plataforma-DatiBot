"use client";

import { useEffect, useRef } from "react";

// Textarea que crece para ajustarse al contenido (no scroll interno, sin resize
// manual). Reemplaza a <textarea> en el asistente de productos.
export function AutoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);

  return (
    <textarea
      ref={ref}
      {...props}
      style={{ overflow: "hidden", resize: "none", ...(props.style ?? {}) }}
    />
  );
}
