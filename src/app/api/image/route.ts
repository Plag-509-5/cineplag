export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("url");
  if (!input) return new Response("Missing image URL", { status: 400 });

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();

    const isAllowed =
      host.endsWith("aoneroom.com") ||
      host.endsWith("moviebox.ph") ||
      host.endsWith("tmdb.org") ||
      host.endsWith("hakunaymatata.com") ||
      host.endsWith("unsplash.com") ||
      host === "51.75.118.170";

    if (!isAllowed) {
      return new Response("Image source not allowed", { status: 403 });
    }

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        Referer: "https://moviebox.ph/",
      },
      signal: AbortSignal.timeout(10000),
      cache: "force-cache",
    });

    if (!response.ok) return new Response("Image unavailable", { status: 404 });
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 503 });
  }
}
