import { getStreamAndCaptions, validType } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const type = params.get("type") || "",
      slug = params.get("slug") || "";
    const episode = params.get("episode") || "",
      chapter = params.get("chapter") || "";
    const querySeason = params.get("season") || "";
    const queryEpisode = params.get("ep") || "";
    const quality = params.get("quality") || "720p";
    const langSubjectId = params.get("langSubjectId") || params.get("subjectId") || "";
    const resourceId = params.get("resourceId") || params.get("resource_id") || "";

    if (!validType(type) || !slug || slug.length > 255) {
      return Response.json({ error: "Paramètres de lecture invalides." }, { status: 400 });
    }

    // Parse season & episode numbers
    let se = 1;
    let ep = 1;

    if (querySeason && queryEpisode) {
      se = parseInt(querySeason, 10) || 1;
      ep = parseInt(queryEpisode, 10) || 1;
    } else if (episode) {
      const m1 = episode.match(/(?:_|-)(\d+)(?:_|-)(\d+)$/);
      if (m1) {
        se = parseInt(m1[1], 10) || 1;
        ep = parseInt(m1[2], 10) || 1;
      } else {
        const m2 = episode.match(/s(\d+)e(\d+)/i);
        if (m2) {
          se = parseInt(m2[1], 10) || 1;
          ep = parseInt(m2[2], 10) || 1;
        } else {
          const m3 = episode.match(/(\d+)$/);
          if (m3) {
            ep = parseInt(m3[1], 10) || 1;
          }
        }
      }
    }

    const { streamUrl, duration, qualityList, isHls, captions, season, episode: parsedEp, subjectId } =
      await getStreamAndCaptions(slug, se, ep, quality, langSubjectId || undefined, resourceId || undefined);

    if (!streamUrl) {
      return Response.json(
        { error: "Flux de lecture momentanément indisponible. Réessayez dans un instant." },
        { status: 503 }
      );
    }

    if (type !== "webtoon" && duration > 0 && duration < 30) {
      return Response.json(
        { error: `Le backend MovieBox a renvoyé un clip de ${Math.round(duration)} s au lieu d’un film ou d’un épisode complet. Sa source doit être corrigée côté API.` },
        { status: 502 }
      );
    }

    const cleanServers = [
      {
        server_name: "Lecteur Haute Définition",
        server_link: streamUrl,
        server_type: isHls ? "hls" : "video",
        version: "Lecteur Natif",
        score: 100,
      },
    ];

    return Response.json({
      servers: cleanServers,
      bestServer: cleanServers[0],
      streamUrl,
      duration,
      qualityList,
      isHls,
      captions,
      season: season || se,
      episode: parsedEp || ep,
      subjectId,
    });
  } catch (err: any) {
    return Response.json(
      { error: "Impossible de charger le flux vidéo pour le moment." },
      { status: 500 }
    );
  }
}
