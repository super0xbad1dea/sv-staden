/**
 * Download-Script für Notion-Bilder
 * Lädt alle Bilder von Notion herunter und speichert sie lokal
 * Wird vor dem Astro-Build ausgeführt
 */

import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// .env Datei laden
config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prüfen ob Umgebungsvariablen vorhanden sind
if (!process.env.NOTION_API_KEY) {
  console.error('❌ NOTION_API_KEY nicht gefunden!');
  console.error('   Stelle sicher, dass die .env Datei existiert oder die Variablen in Netlify gesetzt sind.\n');
  process.exit(1);
}

if (!process.env.NOTION_DATABASE_ID) {
  console.error('❌ NOTION_DATABASE_ID nicht gefunden!');
  process.exit(1);
}

// Notion Client initialisieren
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;
const imageDir = path.join(__dirname, '..', 'public', 'images', 'news');

// Hilfsfunktion: Bild herunterladen
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(filepath);
    
    protocol.get(url, (response) => {
      // Redirect folgen
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {}); // Löschen bei Fehler
      reject(err);
    });
  });
}

// Hilfsfunktion: Slug erstellen
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => {
      const map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };
      return map[char] || char;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Hilfsfunktion: Dateiendung aus URL extrahieren
function getExtension(url) {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp|avif)/i);
  return match ? match[0].toLowerCase() : '.jpg';
}

// Hauptfunktion
async function downloadNotionImages() {
  console.log('📥 Starte Download der Notion-Bilder...\n');
  
  // Ordner erstellen falls nicht vorhanden
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
    console.log(`📁 Ordner erstellt: ${imageDir}\n`);
  }
  
  // Notion-Datenbank abfragen
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Veröffentlicht',
      checkbox: {
        equals: true,
      },
    },
  });
  
  console.log(`📰 ${response.results.length} veröffentlichte Artikel gefunden\n`);
  
  const imageMap = {};
  
  for (const page of response.results) {
    const props = page.properties;
    const title = props.Titel?.title?.[0]?.plain_text || 'ohne-titel';
    const slug = slugify(title);
    
    // Bild-URL extrahieren
    let imageUrl = null;
    const bildProp = props.Bild;
    if (bildProp?.files && bildProp.files.length > 0) {
      const file = bildProp.files[0];
      if (file.type === 'file') {
        imageUrl = file.file?.url;
      } else if (file.type === 'external') {
        imageUrl = file.external?.url;
      }
    }
    
    if (imageUrl) {
      const ext = getExtension(imageUrl);
      const filename = `${slug}${ext}`;
      const filepath = path.join(imageDir, filename);
      
      try {
        console.log(`⬇️  Lade: ${title}`);
        await downloadImage(imageUrl, filepath);
        console.log(`   ✅ Gespeichert: ${filename}\n`);
        
        // Mapping speichern: page.id -> lokaler Pfad
        imageMap[page.id] = `/images/news/${filename}`;
      } catch (err) {
        console.error(`   ❌ Fehler bei ${title}: ${err.message}\n`);
      }
    } else {
      console.log(`⏭️  Übersprungen (kein Bild): ${title}\n`);
    }
  }
  
  // Image-Map als JSON speichern (für Astro)
  const mapPath = path.join(__dirname, '..', 'src', 'data', 'image-map.json');
  const dataDir = path.dirname(mapPath);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(mapPath, JSON.stringify(imageMap, null, 2));
  console.log(`\n📄 Image-Map gespeichert: ${mapPath}`);
  console.log('\n✅ Download abgeschlossen!');
}

// Script ausführen
downloadNotionImages().catch(console.error);