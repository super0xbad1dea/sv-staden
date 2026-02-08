import { Client } from '@notionhq/client';

const notion = new Client({
  auth: import.meta.env.NOTION_API_KEY,
});

const databaseId = import.meta.env.NOTION_DATABASE_ID;

// Image-Map laden (falls vorhanden)
let imageMap: Record<string, string> = {};
try {
  // @ts-ignore - JSON import
  const imageMapModule = await import('../data/image-map.json?url');
  imageMap = imageMapModule.default || {};
  console.log('✅ Image-Map geladen:', Object.keys(imageMap).length, 'Bilder');
} catch (e) {
  console.warn('⚠️ Image-Map nicht gefunden, verwende Notion-URLs als Fallback');
}

// Hilfsfunktion: Slug erstellen
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => {
      const map: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };
      return map[char] || char;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Hilfsfunktion: Datum formatieren
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// Typen
export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  image: string | null;
  category: string;
  author: string;
  date: string;
  published: boolean;
}

// Alle veröffentlichten News abrufen
export async function getPublishedNews(): Promise<NewsArticle[]> {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Veröffentlicht',
      checkbox: {
        equals: true,
      },
    },
    sorts: [
      {
        property: 'Datum',
        direction: 'descending',
      },
    ],
  });

  return response.results.map((page: any) => {
    const props = page.properties;
    const title = props.Titel?.title?.[0]?.plain_text || 'Ohne Titel';
    const slug = slugify(title);
    
    // Bild-URL: Zuerst lokale URL versuchen, sonst Notion-URL
    let imageUrl: string | null = null;
    
    // 1. Versuch: Lokale Bild-URL aus image-map.json
    if (imageMap[page.id]) {
      imageUrl = imageMap[page.id];
    } else {
      // 2. Fallback: Notion-URL (temporär)
      const bildProp = props.Bild;
      if (bildProp?.files && bildProp.files.length > 0) {
        const file = bildProp.files[0];
        if (file.type === 'file') {
          imageUrl = file.file?.url || null;
        } else if (file.type === 'external') {
          imageUrl = file.external?.url || null;
        }
      }
    }

    return {
      id: page.id,
      slug,
      title,
      excerpt: props.Kurztext?.rich_text?.[0]?.plain_text || '',
      content: props.Inhalt?.rich_text?.[0]?.plain_text || '',
      image: imageUrl,
      category: props.Kategorie?.select?.name || 'Verein',
      author: props.Autor?.rich_text?.[0]?.plain_text || 'SV Staden',
      date: props.Datum?.date?.start || new Date().toISOString(),
      published: props.Veröffentlicht?.checkbox || false,
    };
  });
}

// Einzelnen Artikel abrufen
export async function getNewsArticle(slug: string): Promise<NewsArticle | null> {
  const allNews = await getPublishedNews();
  return allNews.find((article) => article.slug === slug) || null;
}