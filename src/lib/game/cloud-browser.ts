import type { CloudSaveState } from "./cloud-save";

/** A UA hint is only useful after a real capability/network failure. It must
 * never prevent a signed-in browser from trying or using cloud saves. */
export function shouldSuggestBilibili(
  userAgent: string,
  state: Pick<CloudSaveState, "status" | "error">,
): boolean {
  const unavailable =
    state.status === "unsupported" ||
    (state.status === "error" && state.error === "unavailable");
  return (
    unavailable &&
    /\b(?:Android|iPhone|iPad|iPod|Mobile)\b/i.test(userAgent) &&
    !/\b(?:BiliApp|bilibili)\b/i.test(userAgent)
  );
}
