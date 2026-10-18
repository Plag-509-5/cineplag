const DEFAULT_MOVIEBOX_API_BASE_URL = "http://169.58.175.210:3029";

export const MOVIEBOX_API_BASE_URL = (
  process.env.MOVIEBOX_API_BASE_URL?.trim() || DEFAULT_MOVIEBOX_API_BASE_URL
).replace(/\/+$/, "");

export function movieboxApiUrl(
  path: string,
  params?: URLSearchParams | Record<string, string | number | null | undefined>
): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${MOVIEBOX_API_BASE_URL}${normalizedPath}`);

  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => url.searchParams.set(key, value));
  } else if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const value = record.detail ?? record.message ?? record.error;
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const messages = value
      .map((entry) => entry && typeof entry === "object" && "msg" in entry ? String(entry.msg) : "")
      .filter(Boolean);
    if (messages.length) return messages.join(" · ");
  }

  return null;
}

export async function fetchMovieboxJson<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 10_000
): Promise<T> {
  const { signal, ...requestOptions } = options;
  const response = await fetch(movieboxApiUrl(path), {
    cache: "no-store",
    ...requestOptions,
    signal: signal || AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();

  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`MovieBox API : réponse HTTP ${response.status}.`);
    }
    throw new Error("MovieBox API : format de réponse inattendu.");
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(payload) || `MovieBox API : réponse HTTP ${response.status}.`);
  }

  return payload as T;
}

export function toMovieboxSubtitleProxyUrl(subtitleUrl: string): string {
  return `/api/subtitles?url=${encodeURIComponent(subtitleUrl)}`;
}
