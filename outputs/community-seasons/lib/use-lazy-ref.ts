import { useRef, type RefObject } from "react";

/** Initialize a mutable object once without evaluating its factory on later renders. */
export function useLazyRef<T extends object>(createValue: () => T): RefObject<T> {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = createValue();
  // The initialization guard above makes the ref non-null before callers receive it.
  return ref as RefObject<T>;
}
