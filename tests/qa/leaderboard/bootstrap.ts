import { isolateStorage } from "../preview/storage.mjs";

if (!["127.0.0.1", "localhost"].includes(location.hostname)) throw Error("Leaderboard QA requires its own local server.");
isolateStorage(Storage.prototype, "qa-community-seasons-leaderboard-v1:");
localStorage.setItem("community-seasons-qa-fixture", "leaderboard");
void import("./main");
