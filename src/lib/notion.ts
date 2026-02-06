import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';

const notion = new Client({
  auth: import.meta.env.NOTION_API_KEY,
});

const databaseId = import.meta.env.NOTION_DATABASE_ID;

// Image-Map laden (vom Build-Script erstellt)
let imageMap: Record<string, string> = {};
try {
  const mapPath = new URL('../data/image-map.json', import.meta.url);
  const mapContent = fs.readFileSync(mapPath, 'utf-8');
  imageMap = JSON.parse(mapContent);
} catch (e) {
  console.log('Image-Map nicht gefunden, verwende Notion-URLs');
}

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
    const title = props.Titel?.title?.[0]?.plain_text || 'Ohne Titel';
    const slug = slugify(title);
    
    // Lokales Bild aus Image-Map verwenden, falls vorhanden
    let imageUrl: string | null = imageMap[page.id] || null;
    
    // Fallback: Notion-URL (nur wenn Image-Map leer)
    if (!imageUrl) {
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

    // Datum sicher extrahieren
    let dateStr = '';
    if (props.Datum?.date?.start) {
      dateStr = props.Datum.date.start;
    }
    
    return {
      id: page.id,
      title: title,
      date: dateStr,
      category: props.Kategorie?.select?.name || 'Verein',
      excerpt: props.Kurztext?.rich_text?.[0]?.plain_text || '',
      content: props.Inhalt?.rich_text?.map((t: any) => t.plain_text).join('') || '',
      image: imageUrl,
      author: props.Autor?.people?.[0]?.name || 'SV Staden',
      slug: slug,
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

// Datum formatieren mit Fallback
export function formatDate(dateString: string): string {
  if (!dateString) {
    return 'Kein Datum';
  }
  
  try {
    const date = new Date(dateString);
    
    // Prüfen ob das Datum gültig ist
    if (isNaN(date.getTime())) {
      return 'Kein Datum';
    }
    
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch (e) {
    return 'Kein Datum';
  }
}