import { isToyPage, type ToySdk } from "./toy-sdk";

export const TOY_SHARE_TIMEOUT_MS = 8000;
export const TOY_NATIVE_TIMEOUT_MS = 30000;
export const TOY_QR_SIZE = 240;
export const TOY_IMAGE_MAX_CHARACTERS = 5_242_880;
const QR_MAX_CHARACTERS = 524_288;
const HOME_PATH = "index.html";

export interface ToyShareCapabilities {
  qr: boolean;
  share: boolean;
  saveImage: boolean;
}

export class ToyShareError extends Error {
  constructor(readonly code: "unsupported" | "timeout" | "invalid-image" | "unavailable") {
    super(`Toy sharing: ${code}`);
    this.name = "ToyShareError";
  }
}

async function bounded<T>(action: () => Promise<T>, milliseconds = TOY_SHARE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToyShareError("timeout")), milliseconds);
    Promise.resolve().then(action).then(resolve, (error: unknown) => {
      const unsupported = !!error && typeof error === "object" && "type" in error && error.type === "unsupported";
      const aborted = error instanceof Error && error.name === "AbortError";
      reject(error instanceof ToyShareError || aborted ? error : new ToyShareError(unsupported ? "unsupported" : "unavailable"));
    }).finally(() => clearTimeout(timer));
  });
}

type Ability = "getQrCode" | "share" | "saveImageToAlbum";
async function supports(sdk: ToySdk | null, ability: Ability): Promise<boolean> {
  if (!sdk || typeof sdk[ability] !== "function") return false;
  return (await bounded(() => sdk.isSupport(ability))) === true;
}

/** Read-only checks. The caller starts this flow after opening the share dialog. */
export async function getToyShareCapabilities(sdk: ToySdk | null): Promise<ToyShareCapabilities> {
  const [qr, share, saveImage] = await Promise.all([
    supports(sdk, "getQrCode"), supports(sdk, "share"), supports(sdk, "saveImageToAlbum"),
  ]);
  return { qr, share, saveImage };
}

function pngDataUrl(value: unknown, maxCharacters: number, maxSide: number, qr = false): string {
  if (typeof value !== "string" || value.length > maxCharacters || !value.startsWith("data:image/png;base64,"))
    throw new ToyShareError("invalid-image");
  const encoded = value.slice(22);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new ToyShareError("invalid-image");
  let bytes: string;
  try { bytes = atob(encoded); } catch { throw new ToyShareError("invalid-image"); }
  const byte = (at: number) => bytes.charCodeAt(at);
  const uint32 = (at: number) => byte(at) * 0x1000000 + byte(at + 1) * 0x10000 + byte(at + 2) * 0x100 + byte(at + 3);
  if (bytes.length < 57 || [137, 80, 78, 71, 13, 10, 26, 10].some((n, i) => byte(i) !== n) ||
      uint32(8) !== 13 || bytes.slice(12, 16) !== "IHDR") throw new ToyShareError("invalid-image");
  const width = uint32(16), height = uint32(20);
  if (!width || !height || width > maxSide || height > maxSide || (qr && (width !== height || width < 80)))
    throw new ToyShareError("invalid-image");
  let position = 8, hasData = false, ended = false;
  while (position + 12 <= bytes.length) {
    const length = uint32(position), kind = bytes.slice(position + 4, position + 8);
    if (!/^[A-Za-z]{4}$/.test(kind) || length > bytes.length - position - 12)
      throw new ToyShareError("invalid-image");
    if (kind === "IDAT" && length > 0) hasData = true;
    position += length + 12;
    if (kind === "IEND") {
      ended = length === 0 && position === bytes.length;
      break;
    }
  }
  if (!hasData || !ended) throw new ToyShareError("invalid-image");
  return value;
}

function validateQrDestination(value: unknown): void {
  let destination: URL;
  try {
    if (typeof value !== "string" || value.length > 2048) throw new Error();
    destination = new URL(value);
  } catch {
    throw new ToyShareError("unavailable");
  }
  // Trust the platform's default Toy destination, including its preview
  // behavior. Never construct a replacement link or expose this raw URL.
  if (destination.protocol !== "https:" || destination.username || destination.password || destination.port ||
      !isToyPage(destination) || destination.search || destination.hash)
    throw new ToyShareError("unavailable");
}

/** The platform owns the QR destination; never accept a supplied URL or game parameters. */
export async function getToyShareQr(sdk: ToySdk): Promise<string> {
  if (!(await supports(sdk, "getQrCode"))) throw new ToyShareError("unsupported");
  const result = await bounded(() => sdk.getQrCode!({ size: TOY_QR_SIZE }));
  const image = pngDataUrl(result?.base64, QR_MAX_CHARACTERS, 1024, true);
  validateQrDestination(result?.url);
  return image;
}

/** Explicit user-click action; no automatic retry of native sharing. */
export async function shareToyLink(sdk: ToySdk, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!(await supports(sdk, "share"))) throw new ToyShareError("unsupported");
  await bounded(() => {
    signal?.throwIfAborted();
    return sdk.share!({ path: HOME_PATH });
  }, TOY_NATIVE_TIMEOUT_MS);
}

/** Explicit user-click action; only the generated PNG is passed to the album API. */
export async function saveToyImage(sdk: ToySdk, base64Data: string, hintMsg?: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const image = pngDataUrl(base64Data, TOY_IMAGE_MAX_CHARACTERS, 4096);
  if (!(await supports(sdk, "saveImageToAlbum"))) throw new ToyShareError("unsupported");
  await bounded(() => {
    signal?.throwIfAborted();
    return sdk.saveImageToAlbum!({
      base64Data: image,
      ...(hintMsg ? { hintMsg: hintMsg.slice(0, 160) } : {}),
    });
  }, TOY_NATIVE_TIMEOUT_MS);
}
