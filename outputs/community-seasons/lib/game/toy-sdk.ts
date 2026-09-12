import type { ToyCloudSdk } from "./cloud-save";

const SDK_URL = "https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js";
export interface ToySdk {
  isSupport(ability: string): Promise<boolean>;
  getCloudStorage?: ToyCloudSdk["getCloudStorage"];
  setCloudStorage?: ToyCloudSdk["setCloudStorage"];
  getQrCode?(request?: { path?: string; size?: number }): Promise<{ base64: string; url: string }>;
  share?(request: { path: string }): Promise<void>;
  saveImageToAlbum?(request: { base64Data: string; hintMsg?: string }): Promise<{ localPath: string }>;
}

let loading: Promise<ToySdk | null> | null = null;

export function isToyPage(url: Pick<Location, "hostname" | "pathname">): boolean {
  const host = url.hostname.toLowerCase();
  return (
    (host === "bilibili.com" ||
      host.endsWith(".bilibili.com") ||
      host === "bilibilitoy.com" ||
      host.endsWith(".bilibilitoy.com")) &&
    url.pathname.startsWith("/toy/")
  );
}

function currentSdk(): ToySdk | null {
  const sdk = (window as Window & { toy?: ToySdk }).toy;
  return sdk && typeof sdk.isSupport === "function" ? sdk : null;
}

export function loadToySdk(): Promise<ToySdk | null> {
  // Standalone exports do not load or contact Toy.
  if (typeof window === "undefined" || !isToyPage(window.location)) return Promise.resolve(null);
  const ready = currentSdk();
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise<ToySdk | null>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        const sdk = currentSdk();
        if (sdk) resolve(sdk);
        else {
          script.remove();
          reject(new Error("Toy SDK is unavailable."));
        }
      }
    };
    const timeout = setTimeout(() => finish(new Error("Toy SDK loading timed out.")), 8000);
    script.onload = () => finish();
    script.onerror = () => finish(new Error("Toy SDK could not be loaded."));
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export async function loadToyCloudStorage(): Promise<ToyCloudSdk | null> {
  const sdk = await loadToySdk();
  if (!sdk) return null;
  if (typeof sdk.getCloudStorage !== "function" || typeof sdk.setCloudStorage !== "function")
    throw new Error("Toy cloud storage is unavailable.");
  return sdk as ToyCloudSdk;
}
