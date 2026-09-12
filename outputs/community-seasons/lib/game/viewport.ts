export interface GameViewport {
  width: number;
  height: number;
  touch: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: "portrait" | "landscape" | null;
}

export function sameGameViewport(a: GameViewport, b: GameViewport): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.touch === b.touch &&
    a.screenWidth === b.screenWidth &&
    a.screenHeight === b.screenHeight &&
    a.orientation === b.orientation
  );
}

/** A phone-sized landscape view cannot leave enough vertical room for the path and HUD. */
export function needsPortrait(view: GameViewport): boolean {
  if (!view.touch || view.orientation === "portrait") return false;
  const cramped = (width: number, height: number) =>
    height > 0 && height <= 450 && width >= height * 1.45 && width <= 1100;
  if (cramped(view.width, view.height)) return true;
  // Toy can provide a tall iframe even when the physical phone is in landscape.
  return (
    view.orientation === "landscape" &&
    cramped(
      Math.max(view.screenWidth, view.screenHeight),
      Math.min(view.screenWidth, view.screenHeight),
    )
  );
}

export function readGameViewport(): GameViewport {
  const visual = window.visualViewport;
  const type = window.screen.orientation?.type;
  const angle =
    window.screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation;
  const orientation =
    type?.startsWith("landscape") || Math.abs(angle ?? 0) === 90
      ? "landscape"
      : type?.startsWith("portrait") || angle === 0 || angle === 180
        ? "portrait"
        : null;
  return {
    width: visual?.width ?? window.innerWidth,
    height: visual?.height ?? window.innerHeight,
    touch:
      window.matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    orientation,
  };
}

export function portraitPromptHeight(view: GameViewport): number {
  return Math.max(
    180,
    Math.min(
      view.height,
      view.orientation === "landscape"
        ? Math.min(view.screenWidth, view.screenHeight) || view.height
        : view.height,
    ),
  );
}
