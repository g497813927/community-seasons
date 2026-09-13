import { compileGameModules } from "../compile-game-modules.mjs";

compileGameModules(new URL("./compiled/", import.meta.url));
