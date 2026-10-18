import { resolveNumericSubjectId } from "@/lib/catalog";
import { movieboxApiUrl } from "@/lib/moviebox-api";

export const dynamic = "force-dynamic";

const positiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 999) : fallback;
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const inputId = (params.get("subjectId") || params.get("slug") || "").trim();
  if (!inputId || inputId.length > 255) {
    return Response.json({ error: "Identifiant de titre manquant ou invalide." }, { status: 400 });
  }

  const requestedQuality = params.get("quality") || "720p";
  const quality = ["4K", "4k", "2160p", "1080p", "720p", "480p", "360p"].includes(requestedQuality)
    ? requestedQuality
    : "720p";
  const title = (params.get("title") || "Movie").replace(/[\r\n]/g, " ").trim().slice(0, 160) || "Movie";
  const season = positiveInteger(params.get("season"), 1);
  const episode = positiveInteger(params.get("episode"), 1);

  try {
    const subjectId = await resolveNumericSubjectId(inputId);
    const upstream = await fetch(
      movieboxApiUrl(`/download/${encodeURIComponent(subjectId)}`, {
        season,
        episode,
        quality,
        title,
      }),
      {
        cache: "no-store",
        headers: request.headers.get("range") ? { Range: request.headers.get("range") as string } : undefined,
        signal: AbortSignal.timeout(10 * 60 * 1000),
      }
    );

    if (!upstream.ok) {
      const message = await upstream.text().catch(() => "");
      return Response.json(
        { error: message.slice(0, 500) || "Le serveur MovieBox n’a pas pu préparer ce téléchargement." },
        { status: upstream.status }
      );
    }

    const headers = new Headers();
    for (const name of ["content-type", "content-length", "content-disposition", "content-range", "accept-ranges", "cache-control"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
    if (!headers.has("content-disposition")) {
      headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${title}-${quality}.mp4`)}`);
    }
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "Le service de téléchargement MovieBox est temporairement indisponible." }, { status: 503 });
  }
}
