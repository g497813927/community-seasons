/** Subscribe and clean up with the same API, including older Safari. */
export function listenToMediaQuery(query: MediaQueryList, onChange: () => void): () => void {
  if (typeof query.addEventListener === "function" && typeof query.removeEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}
