import { movieboxApiUrl } from "@/lib/moviebox-api";

export const dynamic = "force-dynamic";

function isPrivateAddress(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }

  return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("url");
  if (!input || input.length > 4096) {
    return new Response("URL de sous-titres manquante ou trop longue.", { status: 400 });
  }

  let subtitleUrl: URL;
  try {
    subtitleUrl = new URL(input);
  } catch {
    return new Response("URL de sous-titres invalide.", { status: 400 });
  }

  if (
    !["http:", "https:"].includes(subtitleUrl.protocol) ||
    subtitleUrl.username ||
    subtitleUrl.password ||
    isPrivateAddress(subtitleUrl.hostname)
  ) {
    return new Response("Source de sous-titres non autorisée.", { status: 400 });
  }

  try {
    const upstream = await fetch(movieboxApiUrl("/sub-proxy", { u: subtitleUrl.toString() }), {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      return new Response("Impossible de charger les sous-titres.", { status: upstream.status });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Service de sous-titres temporairement indisponible.", { status: 503 });
  }
}
