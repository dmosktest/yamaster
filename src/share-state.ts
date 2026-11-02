export type ShareStateV1 = {
  v: 1;
  left: string;
  right: string;
  ignorePaths: string[];
  kubernetes: boolean;
  arrayAsSet: boolean;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return bytes;
  const part = new Uint8Array(bytes);
  const stream = new Blob([part]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array, compressed: boolean): Promise<Uint8Array> {
  if (!compressed || typeof DecompressionStream === "undefined") return bytes;
  const part = new Uint8Array(bytes);
  const stream = new Blob([part])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeShareState(state: ShareStateV1): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream !== "undefined") {
    const compressed = await deflate(json);
    return `1.${bytesToBase64Url(compressed)}`;
  }
  return `0.${bytesToBase64Url(json)}`;
}

export async function decodeShareState(hash: string): Promise<ShareStateV1 | null> {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const version = raw.slice(0, dot);
  const payload = raw.slice(dot + 1);
  if ((version !== "0" && version !== "1") || !payload) return null;

  try {
    const bytes = await inflate(base64UrlToBytes(payload), version === "1");
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as ShareStateV1;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.left !== "string" || typeof parsed.right !== "string") return null;
    return {
      v: 1,
      left: parsed.left,
      right: parsed.right,
      ignorePaths: Array.isArray(parsed.ignorePaths)
        ? parsed.ignorePaths.filter((v): v is string => typeof v === "string")
        : [],
      kubernetes: Boolean(parsed.kubernetes),
      arrayAsSet: Boolean(parsed.arrayAsSet),
    };
  } catch {
    return null;
  }
}
