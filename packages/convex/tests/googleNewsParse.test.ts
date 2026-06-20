import { describe, expect, it } from "vitest";
import {
  buildGoogleNewsFeedItems,
  dedupeGoogleNewsItems,
  parseGoogleNewsRss,
  type GoogleNewsItem,
} from "../convex/feed/providers/googleNews";

// A single-<item> feed: exercises the `isArray: item` coercion (one item must
// still parse as an array), the " - Publisher" suffix strip, <source url> →
// domain, <guid> #text extraction, escaped-entity decode, and pubDate parse.
const SINGLE_ITEM_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Google Berita</title>
<item>
<title>Vaksin baru &amp; uji klinis dimulai - Kompas</title>
<link>https://news.google.com/rss/articles/CBMiAAAA?oc=5</link>
<guid isPermaLink="false">CBMiAAAA</guid>
<pubDate>Thu, 11 Jun 2026 11:44:00 GMT</pubDate>
<description>&lt;a href="https://news.google.com/rss/articles/CBMiAAAA?oc=5"&gt;Vaksin baru &amp;amp; uji klinis dimulai&lt;/a&gt;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Kompas&lt;/font&gt;</description>
<source url="https://www.kompas.com">Kompas</source>
</item>
</channel></rss>`;

// Two items: the second has no <source> (→ "Google News" fallback) and no
// <pubDate> (→ undefined, caller falls back to now).
const MULTI_ITEM_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
<title>Riset gizi anak - Antara</title>
<link>https://news.google.com/rss/articles/AAA1?oc=5</link>
<guid isPermaLink="false">AAA1</guid>
<pubDate>Mon, 15 Jun 2026 21:18:33 GMT</pubDate>
<source url="https://www.antaranews.com">Antara</source>
</item>
<item>
<title>Penelitian energi surya</title>
<link>https://news.google.com/rss/articles/AAA2?oc=5</link>
<guid isPermaLink="false">AAA2</guid>
</item>
</channel></rss>`;

describe("parseGoogleNewsRss", () => {
  it("parses a single item (array coercion), strips publisher suffix, decodes entities", () => {
    const items = parseGoogleNewsRss(SINGLE_ITEM_RSS);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.title).toBe("Vaksin baru & uji klinis dimulai");
    expect(item.guid).toBe("CBMiAAAA");
    expect(item.redirectUrl).toBe(
      "https://news.google.com/rss/articles/CBMiAAAA?oc=5",
    );
    expect(item.publisherName).toBe("Kompas");
    expect(item.publisherDomain).toBe("kompas.com");
    expect(item.pubDate).toBe(Date.parse("Thu, 11 Jun 2026 11:44:00 GMT"));
    expect(item.descriptionSnippet).toContain("Vaksin baru & uji klinis");
    expect(item.descriptionSnippet).not.toContain("<");
  });

  it("falls back to 'Google News' + undefined pubDate when source/pubDate absent", () => {
    const items = parseGoogleNewsRss(MULTI_ITEM_RSS);
    expect(items).toHaveLength(2);
    expect(items[0].publisherName).toBe("Antara");
    expect(items[0].publisherDomain).toBe("antaranews.com");
    expect(items[1].publisherName).toBe("Google News");
    expect(items[1].publisherDomain).toBeUndefined();
    expect(items[1].pubDate).toBeUndefined();
  });

  it("respects the limit and returns [] for malformed XML", () => {
    expect(parseGoogleNewsRss(MULTI_ITEM_RSS, 1)).toHaveLength(1);
    expect(parseGoogleNewsRss("<<not xml", 5)).toEqual([]);
  });

  it("keeps an item with a bare numeric title (parser coerces it to a number)", () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>2026</title>
<link>https://news.google.com/rss/articles/N1?oc=5</link>
<guid isPermaLink="false">N1</guid>
</item></channel></rss>`;
    const items = parseGoogleNewsRss(rss);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("2026");
  });
});

function newsItem(overrides: Partial<GoogleNewsItem>): GoogleNewsItem {
  return {
    title: "Judul",
    redirectUrl: "https://news.google.com/rss/articles/X?oc=5",
    guid: "X",
    publisherName: "Pub",
    publisherDomain: "pub.com",
    ...overrides,
  };
}

describe("dedupeGoogleNewsItems", () => {
  it("dedupes by guid (primary) and title+domain (secondary), honoring cap", () => {
    const seed1 = [
      newsItem({ guid: "g1", title: "A", publisherDomain: "x.com" }),
      newsItem({ guid: "g2", title: "B", publisherDomain: "y.com" }),
    ];
    const seed2 = [
      newsItem({ guid: "g1", title: "A", publisherDomain: "x.com" }), // dup guid
      newsItem({ guid: "g3", title: "A", publisherDomain: "x.com" }), // dup title+domain
      newsItem({ guid: "g4", title: "C", publisherDomain: "z.com" }),
    ];
    const out = dedupeGoogleNewsItems(
      [
        { label: "S1", items: seed1 },
        { label: "S2", items: seed2 },
      ],
      10,
    );
    expect(out.map((o) => o.item.guid)).toEqual(["g1", "g2", "g4"]);
    expect(out[0].topicLabel).toBe("S1");
    expect(out[2].topicLabel).toBe("S2");

    const capped = dedupeGoogleNewsItems([{ label: "S1", items: seed1 }], 1);
    expect(capped).toHaveLength(1);
  });

  it("does NOT merge distinct guids that share a title but have no domain", () => {
    const out = dedupeGoogleNewsItems(
      [
        {
          label: "S1",
          items: [
            newsItem({ guid: "n1", title: "Berita", publisherDomain: undefined }),
            newsItem({ guid: "n2", title: "Berita", publisherDomain: undefined }),
          ],
        },
      ],
      10,
    );
    expect(out.map((o) => o.item.guid)).toEqual(["n1", "n2"]);
  });
});

describe("buildGoogleNewsFeedItems", () => {
  it("maps to feedItems shape (provider, dedupeKey, sourceLabel, publishedAt fallback)", () => {
    const now = 1_700_000_000_000;
    const built = buildGoogleNewsFeedItems(
      [
        {
          item: newsItem({ guid: "g1", title: "A", pubDate: 123, publisherName: "Kompas" }),
          topicLabel: "Sains",
        },
        { item: newsItem({ guid: "g2", title: "B" }), topicLabel: "Kesehatan" },
      ],
      now,
    );
    expect(built[0]).toMatchObject({
      kind: "news",
      provider: "google_news",
      title: "A",
      summary: "",
      sourceLabel: "Kompas",
      topics: ["Sains"],
      trendScore: 0,
      dedupeKey: "news:gnews:g1",
      publishedAt: 123,
    });
    // No pubDate → publishedAt falls back to `now`.
    expect(built[1].publishedAt).toBe(now);
    expect(built[1].dedupeKey).toBe("news:gnews:g2");
  });
});
