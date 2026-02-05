import { Client } from '@notionhq/client';

const notion = new Client({
  auth: import.meta.env.NOTION_API_KEY,
});

const databaseId = import.meta.env.NOTION_DATABASE_ID;

export interface NewsArticle {
  id: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  content: string;
  image: string | null;
  author: string;
  slug: string;
}

// Alle veröffentlichten News-Artikel abrufen
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
    
    return {
      id: page.id,
      title: props.Titel?.title?.[0]?.plain_text || 'Ohne Titel',
      date: props.Datum?.date?.start || new Date().toISOString().split('T')[0],
      category: props.Kategorie?.select?.name || 'Verein',
      excerpt: props.Kurztext?.rich_text?.[0]?.plain_text || '',
      content: props.Inhalt?.rich_text?.[0]?.plain_text || '',
      image: props.Bild?.files?.[0]?.file?.url || props.Bild?.files?.[0]?.external?.url || null,
      author: props.Autor?.people?.[0]?.name || 'SV Teutonia',
      slug: slugify(props.Titel?.title?.[0]?.plain_text || page.id),
    };
  });
}

// Einzelnen Artikel abrufen
export async function getNewsArticle(slug: string): Promise<NewsArticle | null> {
  const articles = await getPublishedNews();
  return articles.find(article => article.slug === slug) || null;
}

// News nach Kategorie filtern
export async function getNewsByCategory(category: string): Promise<NewsArticle[]> {
  const articles = await getPublishedNews();
  if (category === 'Alle') return articles;
  return articles.filter(article => article.category === category);
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

// Datum formatieren
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}