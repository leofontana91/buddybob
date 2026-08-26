/**
 * Ricerca web per la voce di BOB.
 * Preferisce Tavily se c’è TAVILY_API_KEY, altrimenti DuckDuckGo (senza chiave).
 */

export type WebSearchHit = {
  title: string;
  snippet: string;
  url?: string;
};

export async function searchWeb(query: string): Promise<{
  query: string;
  summary: string;
  hits: WebSearchHit[];
}> {
  const q = query.trim().slice(0, 200);
  if (!q) {
    return { query: "", summary: "", hits: [] };
  }

  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    const fromTavily = await searchTavily(q, tavilyKey);
    if (fromTavily.hits.length > 0 || fromTavily.summary) return fromTavily;
  }

  return searchDuckDuckGo(q);
}

async function searchTavily(
  query: string,
  apiKey: string
): Promise<{ query: string; summary: string; hits: WebSearchHit[] }> {
  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) {
      console.warn("[web-search] tavily", resp.status);
      return { query, summary: "", hits: [] };
    }
    const data = (await resp.json()) as {
      answer?: string;
      results?: { title?: string; content?: string; url?: string }[];
    };
    const hits: WebSearchHit[] = (data.results ?? [])
      .slice(0, 5)
      .map((r) => ({
        title: (r.title ?? "").trim(),
        snippet: (r.content ?? "").trim().slice(0, 400),
        url: r.url,
      }))
      .filter((h) => h.title || h.snippet);
    return {
      query,
      summary: (data.answer ?? "").trim().slice(0, 800),
      hits,
    };
  } catch (e) {
    console.warn("[web-search] tavily failed", e);
    return { query, summary: "", hits: [] };
  }
}

async function searchDuckDuckGo(
  query: string
): Promise<{ query: string; summary: string; hits: WebSearchHit[] }> {
  const hits: WebSearchHit[] = [];
  let summary = "";

  try {
    const url =
      "https://api.duckduckgo.com/?" +
      new URLSearchParams({
        q: query,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
      }).toString();
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        AbstractText?: string;
        AbstractSource?: string;
        AbstractURL?: string;
        Answer?: string;
        Definition?: string;
        DefinitionURL?: string;
        Heading?: string;
        RelatedTopics?: (
          | { Text?: string; FirstURL?: string }
          | { Name?: string; Topics?: { Text?: string; FirstURL?: string }[] }
        )[];
      };
      summary = (
        data.Answer ||
        data.AbstractText ||
        data.Definition ||
        ""
      ).trim();
      if (summary) {
        hits.push({
          title: (data.Heading || data.AbstractSource || "Risultato").trim(),
          snippet: summary.slice(0, 500),
          url: data.AbstractURL || data.DefinitionURL,
        });
      }
      for (const topic of data.RelatedTopics ?? []) {
        if ("Topics" in topic && Array.isArray(topic.Topics)) {
          for (const t of topic.Topics.slice(0, 3)) {
            if (t.Text) {
              hits.push({
                title: t.Text.split(" - ")[0]?.slice(0, 80) || "Related",
                snippet: t.Text.slice(0, 400),
                url: t.FirstURL,
              });
            }
          }
        } else if ("Text" in topic && topic.Text) {
          hits.push({
            title: topic.Text.split(" - ")[0]?.slice(0, 80) || "Related",
            snippet: topic.Text.slice(0, 400),
            url: topic.FirstURL,
          });
        }
        if (hits.length >= 6) break;
      }
    }
  } catch (e) {
    console.warn("[web-search] duckduckgo failed", e);
  }

  // Se Instant Answer è vuoto, prova Wikipedia (lingua IT/EN)
  if (hits.length === 0) {
    const wiki = await searchWikipedia(query);
    if (wiki) hits.push(wiki);
    if (wiki?.snippet) summary = wiki.snippet;
  }

  return {
    query,
    summary: summary.slice(0, 800),
    hits: hits.slice(0, 6),
  };
}

async function searchWikipedia(query: string): Promise<WebSearchHit | null> {
  for (const lang of ["it", "en"] as const) {
    try {
      const searchUrl =
        `https://${lang}.wikipedia.org/w/api.php?` +
        new URLSearchParams({
          action: "opensearch",
          search: query,
          limit: "1",
          namespace: "0",
          format: "json",
          origin: "*",
        }).toString();
      const searchResp = await fetch(searchUrl, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!searchResp.ok) continue;
      const arr = (await searchResp.json()) as [
        string,
        string[],
        string[],
        string[],
      ];
      const title = arr[1]?.[0];
      const pageUrl = arr[3]?.[0];
      if (!title) continue;

      const sumUrl =
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` +
        encodeURIComponent(title);
      const sumResp = await fetch(sumUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!sumResp.ok) continue;
      const sum = (await sumResp.json()) as {
        title?: string;
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      const snippet = (sum.extract ?? "").trim();
      if (!snippet) continue;
      return {
        title: sum.title || title,
        snippet: snippet.slice(0, 500),
        url: sum.content_urls?.desktop?.page || pageUrl,
      };
    } catch {
      /* try next lang */
    }
  }
  return null;
}

/** Testo compatto da passare al modello (TTS-friendly). */
export function formatSearchForModel(result: Awaited<ReturnType<typeof searchWeb>>): string {
  if (!result.hits.length && !result.summary) {
    return `No useful web results for: ${result.query}`;
  }
  const lines: string[] = [`Web search for: ${result.query}`];
  if (result.summary) lines.push(`Answer/summary: ${result.summary}`);
  result.hits.forEach((h, i) => {
    lines.push(
      `${i + 1}. ${h.title}${h.snippet ? ` — ${h.snippet}` : ""}${
        h.url ? ` (${h.url})` : ""
      }`
    );
  });
  return lines.join("\n").slice(0, 3500);
}
