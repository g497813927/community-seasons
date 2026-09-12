export const SCENES = [
  {
    id: "spring",
    name: "Spring Commons",
    description: "Blossom groves, garden arbors and quiet park ponds.",
  },
  {
    id: "summer",
    name: "Summer Riverside",
    description: "A wooden riverside boardwalk, little docks and passing sailboats.",
  },
  {
    id: "autumn",
    name: "Autumn Avenue",
    description: "A brick avenue lined with market stalls and warm townhouses.",
  },
  {
    id: "winter",
    name: "Winter Square",
    description: "Snow-roofed cabins, evergreen trees and frozen village ponds.",
  },
] as const;
export type SceneKind = (typeof SCENES)[number]["id"];
export function isSceneKind(value: unknown): value is SceneKind {
  return SCENES.some((scene) => scene.id === value);
}
export function sceneDefinition(kind: SceneKind) {
  return SCENES.find((scene) => scene.id === kind) ?? SCENES[0];
}
export function nextScene(kind: SceneKind): SceneKind {
  return SCENES[(SCENES.findIndex((scene) => scene.id === kind) + 1) % SCENES.length].id;
}
