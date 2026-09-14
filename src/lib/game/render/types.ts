import type { SceneKind } from "../scenes";

export type V = [number, number, number];
export type Face = {
  points: V[];
  color: string;
  z: number;
  layer: number;
  text?: { value: string; color: string; emphasis?: boolean };
  portal?: SceneKind;
  journey?: { scene: SceneKind; mode: "rail" | "run" };
  cameraSpace?: boolean;
  cull?: boolean;
  boardwalk?: boolean;
  opacity?: number;
};
