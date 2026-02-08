/**
 * Bild-Optimierungs-Script für SV Staden
 * 
 * Optimiert alle Bilder in public/images:
 * - Verkleinert große Bilder auf max. 1920px Breite
 * - Komprimiert JPEGs auf 85% Qualität
 * - Komprimiert PNGs verlustfrei
 * - Konvertiert zu WebP für moderne Browser
 * - Überspringt bereits optimierte Bilder
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Konfiguration
const CONFIG = {
  imageDirs: [
    path.join(__dirname, '..', 'public', 'images'),
    path.join(__dirname, '..', 'public', 'images', 'news'),
  ],
  maxWidth: 1920,          // Maximale Breite für Hero-Bilder
  newsMaxWidth: 1200,      // Maximale Breite für News-Bilder
  jpegQuality: 85,         // JPEG Qualität (0-100)
  webpQuality: 80,         // WebP Qualität (0-100)
  pngCompressionLevel: 9,  // PNG Kompression (0-9)
  cacheFile: path.join(__dirname, '..', '.image-cache.json'),
  supportedFormats: ['.jpg', '.jpeg', '.png', '.webp'],
};

// Cache für bereits optimierte Bilder
let imageCache = {};

// Cache laden
function loadCache() {
  try {
    if (fs.existsSync(CONFIG.cacheFile)) {
      const data = fs.readFileSync(CONFIG.cacheFile, 'utf8');
      imageCache = JSON.parse(data);
      console.log(`📋 Cache geladen: ${Object.keys(imageCache).length} Einträge\n`);
    }
  } catch (e) {
    console.log('📋 Neuer Cache wird erstellt\n');
    imageCache = {};
  }
}

// Cache speichern
function saveCache() {
  try {
    fs.writeFileSync(CONFIG.cacheFile, JSON.stringify(imageCache, null, 2));
    console.log(`\n💾 Cache gespeichert: ${Object.keys(imageCache).length} Einträge`);
  } catch (e) {
    console.error('❌ Fehler beim Speichern des Cache:', e.message);
  }
}

// Hash einer Datei berechnen
function getFileHash(filepath) {
  const buffer = fs.readFileSync(filepath);
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// Prüfen ob Bild bereits optimiert wurde
function isOptimized(filepath, hash) {
  const cached = imageCache[filepath];
  if (!cached) return false;
  if (cached.hash !== hash) return false;
  if (!cached.optimized) return false;
  return true;
}

// Dateiinformationen ausgeben
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Bild optimieren
async function optimizeImage(filepath) {
  const filename = path.basename(filepath);
  const ext = path.extname(filepath).toLowerCase();
  
  // Nur unterstützte Formate
  if (!CONFIG.supportedFormats.includes(ext)) {
    return { skipped: true, reason: 'Nicht unterstütztes Format' };
  }

  // Hash berechnen
  const hash = getFileHash(filepath);
  
  // Prüfen ob bereits optimiert
  if (isOptimized(filepath, hash)) {
    return { skipped: true, reason: 'Bereits optimiert' };
  }

  const originalSize = fs.statSync(filepath).size;
  
  try {
    const image = sharp(filepath);
    const metadata = await image.metadata();
    
    // Maximale Breite bestimmen (News-Bilder vs. Hero-Bilder)
    const isNewsImage = filepath.includes('/news/');
    const maxWidth = isNewsImage ? CONFIG.newsMaxWidth : CONFIG.maxWidth;
    
    let resized = false;
    let pipeline = image.clone();
    
    // Größe anpassen falls nötig
    if (metadata.width && metadata.width > maxWidth) {
      pipeline = pipeline.resize(maxWidth, null, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      resized = true;
    }
    
    // Temporäre Datei für Optimierung
    const tempPath = filepath + '.tmp';
    
    // Format-spezifische Optimierung
    if (ext === '.jpg' || ext === '.jpeg') {
      await pipeline
        .jpeg({
          quality: CONFIG.jpegQuality,
          progressive: true,
          mozjpeg: true,
        })
        .toFile(tempPath);
    } else if (ext === '.png') {
      await pipeline
        .png({
          compressionLevel: CONFIG.pngCompressionLevel,
          progressive: true,
        })
        .toFile(tempPath);
    } else if (ext === '.webp') {
      await pipeline
        .webp({
          quality: CONFIG.webpQuality,
        })
        .toFile(tempPath);
    }
    
    const optimizedSize = fs.statSync(tempPath).size;
    const savedBytes = originalSize - optimizedSize;
    const savedPercent = Math.round((savedBytes / originalSize) * 100);
    
    // Nur überschreiben wenn wirklich kleiner
    if (optimizedSize < originalSize) {
      fs.renameSync(tempPath, filepath);
      
      // Optional: WebP-Version erstellen für moderne Browser
      if (ext !== '.webp') {
        const webpPath = filepath.replace(ext, '.webp');
        await sharp(filepath)
          .webp({ quality: CONFIG.webpQuality })
          .toFile(webpPath);
      }
      
      // Cache aktualisieren
      imageCache[filepath] = {
        hash: getFileHash(filepath),
        optimized: true,
        originalSize,
        optimizedSize,
        timestamp: new Date().toISOString(),
      };
      
      return {
        success: true,
        resized,
        originalSize,
        optimizedSize,
        savedBytes,
        savedPercent,
      };
    } else {
      // Temp-Datei löschen wenn größer
      fs.unlinkSync(tempPath);
      
      // Als optimiert markieren (nichts zu verbessern)
      imageCache[filepath] = {
        hash,
        optimized: true,
        originalSize,
        optimizedSize: originalSize,
        timestamp: new Date().toISOString(),
      };
      
      return { skipped: true, reason: 'Keine Verbesserung möglich' };
    }
    
  } catch (error) {
    return { error: error.message };
  }
}

// Alle Bilder in einem Verzeichnis verarbeiten
async function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`⚠️  Verzeichnis nicht gefunden: ${dirPath}\n`);
    return { processed: 0, skipped: 0, errors: 0 };
  }
  
  const files = fs.readdirSync(dirPath);
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return CONFIG.supportedFormats.includes(ext);
  });
  
  if (imageFiles.length === 0) {
    console.log(`📁 ${path.basename(dirPath)}: Keine Bilder gefunden\n`);
    return { processed: 0, skipped: 0, errors: 0 };
  }
  
  console.log(`📁 ${path.basename(dirPath)}: ${imageFiles.length} Bilder gefunden`);
  console.log('─'.repeat(70));
  
  let stats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    totalSaved: 0,
  };
  
  for (const file of imageFiles) {
    const filepath = path.join(dirPath, file);
    const result = await optimizeImage(filepath);
    
    if (result.success) {
      stats.processed++;
      stats.totalSaved += result.savedBytes;
      const icon = result.resized ? '📐' : '🗜️';
      console.log(
        `${icon} ${file}\n` +
        `   ${formatBytes(result.originalSize)} → ${formatBytes(result.optimizedSize)} ` +
        `(-${result.savedPercent}%)`
      );
    } else if (result.skipped) {
      stats.skipped++;
      console.log(`⏭️  ${file} - ${result.reason}`);
    } else if (result.error) {
      stats.errors++;
      console.log(`❌ ${file} - Fehler: ${result.error}`);
    }
  }
  
  console.log('─'.repeat(70));
  console.log(
    `✅ ${stats.processed} optimiert | ⏭️  ${stats.skipped} übersprungen | ` +
    `❌ ${stats.errors} Fehler`
  );
  
  if (stats.totalSaved > 0) {
    console.log(`💾 Gesamt gespart: ${formatBytes(stats.totalSaved)}`);
  }
  
  console.log();
  
  return stats;
}

// Hauptfunktion
async function main() {
  console.log('🖼️  Bild-Optimierung für SV Staden');
  console.log('═'.repeat(70));
  console.log(`📏 Max. Breite: ${CONFIG.maxWidth}px (Hero), ${CONFIG.newsMaxWidth}px (News)`);
  console.log(`🎨 JPEG Qualität: ${CONFIG.jpegQuality}%`);
  console.log(`🎨 WebP Qualität: ${CONFIG.webpQuality}%`);
  console.log('═'.repeat(70));
  console.log();
  
  // Cache laden
  loadCache();
  
  // Alle Verzeichnisse verarbeiten
  let totalStats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    totalSaved: 0,
  };
  
  for (const dirPath of CONFIG.imageDirs) {
    const stats = await processDirectory(dirPath);
    totalStats.processed += stats.processed;
    totalStats.skipped += stats.skipped;
    totalStats.errors += stats.errors;
    totalStats.totalSaved += stats.totalSaved;
  }
  
  // Cache speichern
  saveCache();
  
  // Zusammenfassung
  console.log('═'.repeat(70));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('═'.repeat(70));
  console.log(`✅ Optimiert:     ${totalStats.processed} Bilder`);
  console.log(`⏭️  Übersprungen:  ${totalStats.skipped} Bilder`);
  console.log(`❌ Fehler:        ${totalStats.errors} Bilder`);
  if (totalStats.totalSaved > 0) {
    console.log(`💾 Gesamt gespart: ${formatBytes(totalStats.totalSaved)}`);
  }
  console.log('═'.repeat(70));
  console.log('✅ Optimierung abgeschlossen!\n');
}

// Script ausführen
main().catch(console.error);