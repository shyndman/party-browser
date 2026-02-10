#!/usr/bin/env node

/**
 * Firefox XPI Build Script
 * 
 * Builds and packages the Browser MCP Firefox extension into an installable XPI file.
 * 
 * Usage:
 *   node scripts/build-xpi.mjs
 *   npm run build:xpi
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// Configuration
const CONFIG = {
  extensionDir: path.join(ROOT_DIR, 'extension'),
  outputDir: path.join(ROOT_DIR, 'dist'),
  outputName: 'browser-mcp-firefox.xpi',
  tempDir: path.join(ROOT_DIR, '.build-temp')
};

/**
 * CRC32 lookup table for ZIP
 */
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c;
}

/**
 * Calculate CRC32 checksum
 */
function calculateCRC32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Deflate content using zlib
 */
async function deflateContent(content) {
  const zlib = await import('zlib');
  return new Promise((resolve, reject) => {
    zlib.deflateRaw(content, { level: 6 }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Main build function
 */
async function buildXPI() {
  console.log('🔨 Building Browser MCP Firefox extension...\n');

  try {
    // Read package.json for version info
    const packageJson = await readPackageJson();
    console.log(`📦 Version: ${packageJson.version}`);

    // Clean and create temp directory
    await cleanTempDir();

    // Copy extension files to temp
    await copyExtensionFiles();

    // Create dist directory
    await createDistDir();

    // Create XPI (ZIP) file
    const xpiPath = await createXPI();

    // Validate the XPI
    await validateXPI(xpiPath);

    // Clean up temp
    await cleanTempDir();

    // Print success
    printSuccess(xpiPath, packageJson.version);

    return xpiPath;
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Read package.json
 */
async function readPackageJson() {
  const packagePath = path.join(ROOT_DIR, 'package.json');
  const content = await fs.promises.readFile(packagePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Clean temp directory
 */
async function cleanTempDir() {
  try {
    if (fs.existsSync(CONFIG.tempDir)) {
      await fs.promises.rm(CONFIG.tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Create dist directory
 */
async function createDistDir() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    await fs.promises.mkdir(CONFIG.outputDir, { recursive: true });
  }
}

/**
 * Copy extension files to temp directory
 */
async function copyExtensionFiles() {
  console.log('📁 Copying extension files...');

  await fs.promises.mkdir(CONFIG.tempDir, { recursive: true });

  const files = [
    'manifest.json',
    'background.js',
    'content-script.js',
    'popup.html',
    'popup.js'
  ];

  // Copy main files
  for (const file of files) {
    const src = path.join(CONFIG.extensionDir, file);
    const dest = path.join(CONFIG.tempDir, file);

    if (!fs.existsSync(src)) {
      throw new Error(`Required file missing: ${file}`);
    }

    await fs.promises.copyFile(src, dest);
    console.log(`  ✓ ${file}`);
  }

  // Copy icons directory
  const iconsSrc = path.join(CONFIG.extensionDir, 'icons');
  const iconsDest = path.join(CONFIG.tempDir, 'icons');

  if (fs.existsSync(iconsSrc)) {
    await fs.promises.mkdir(iconsDest, { recursive: true });
    const icons = await fs.promises.readdir(iconsSrc);

    for (const icon of icons) {
      if (icon.endsWith('.png')) {
        await fs.promises.copyFile(
          path.join(iconsSrc, icon),
          path.join(iconsDest, icon)
        );
        console.log(`  ✓ icons/${icon}`);
      }
    }
  }

  console.log('');
}

/**
 * Create XPI (ZIP) file
 */
async function createXPI() {
  console.log('📦 Creating XPI archive...');

  const outputPath = path.join(CONFIG.outputDir, CONFIG.outputName);

  // Remove existing file
  if (fs.existsSync(outputPath)) {
    await fs.promises.unlink(outputPath);
  }

  // Build ZIP manually
  const files = await getAllFiles(CONFIG.tempDir);
  const output = createWriteStream(outputPath);

  const centralDirectory = [];
  let localHeaderOffset = 0;

  for (const filePath of files) {
    const relativePath = path.relative(CONFIG.tempDir, filePath).replace(/\\/g, '/');
    const content = await fs.promises.readFile(filePath);
    const compressed = await deflateContent(content);

    const crc32 = calculateCRC32(content);
    const uncompressedSize = content.length;
    const compressedSize = compressed.length;

    // Write local file header
    const localHeader = createLocalFileHeader(relativePath, crc32, compressedSize, uncompressedSize);
    output.write(localHeader);

    // Write compressed data
    output.write(compressed);

    // Record central directory entry
    centralDirectory.push({
      name: relativePath,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    localHeaderOffset += localHeader.length + compressedSize;
  }

  // Write central directory
  const centralDirOffset = localHeaderOffset;
  let centralDirSize = 0;

  for (const entry of centralDirectory) {
    const cdEntry = createCentralDirectoryEntry(entry);
    output.write(cdEntry);
    centralDirSize += cdEntry.length;
  }

  // Write end of central directory
  const eocd = createEndOfCentralDirectory(centralDirSize, centralDirOffset, centralDirectory.length);
  output.write(eocd);

  // Close the file
  await new Promise((resolve, reject) => {
    output.end(() => resolve());
    output.on('error', reject);
  });

  console.log(`  ✓ Created: ${path.basename(outputPath)}\n`);
  return outputPath;
}

/**
 * Create local file header
 */
function createLocalFileHeader(name, crc32, compressedSize, uncompressedSize) {
  const nameBuffer = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(30 + nameBuffer.length);

  // Local file header signature
  header.writeUInt32LE(0x04034b50, 0);
  // Version needed to extract (2.0)
  header.writeUInt16LE(20, 4);
  // General purpose bit flag
  header.writeUInt16LE(0, 6);
  // Compression method (deflate)
  header.writeUInt16LE(8, 8);
  // Last mod file time
  header.writeUInt16LE(0, 10);
  // Last mod file date
  header.writeUInt16LE(0, 12);
  // CRC-32
  header.writeUInt32LE(crc32, 14);
  // Compressed size
  header.writeUInt32LE(compressedSize, 18);
  // Uncompressed size
  header.writeUInt32LE(uncompressedSize, 22);
  // File name length
  header.writeUInt16LE(nameBuffer.length, 26);
  // Extra field length
  header.writeUInt16LE(0, 28);
  // File name
  nameBuffer.copy(header, 30);

  return header;
}

/**
 * Create central directory entry
 */
function createCentralDirectoryEntry(entry) {
  const nameBuffer = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(46 + nameBuffer.length);

  // Central directory signature
  header.writeUInt32LE(0x02014b50, 0);
  // Version made by
  header.writeUInt16LE(20, 4);
  // Version needed to extract
  header.writeUInt16LE(20, 6);
  // General purpose bit flag
  header.writeUInt16LE(0, 8);
  // Compression method
  header.writeUInt16LE(8, 10);
  // Last mod file time
  header.writeUInt16LE(0, 12);
  // Last mod file date
  header.writeUInt16LE(0, 14);
  // CRC-32
  header.writeUInt32LE(entry.crc32, 16);
  // Compressed size
  header.writeUInt32LE(entry.compressedSize, 20);
  // Uncompressed size
  header.writeUInt32LE(entry.uncompressedSize, 24);
  // File name length
  header.writeUInt16LE(nameBuffer.length, 28);
  // Extra field length
  header.writeUInt16LE(0, 30);
  // File comment length
  header.writeUInt16LE(0, 32);
  // Disk number start
  header.writeUInt16LE(0, 34);
  // Internal file attributes
  header.writeUInt16LE(0, 36);
  // External file attributes
  header.writeUInt32LE(0, 38);
  // Relative offset of local header
  header.writeUInt32LE(entry.localHeaderOffset, 42);
  // File name
  nameBuffer.copy(header, 46);

  return header;
}

/**
 * Create end of central directory record
 */
function createEndOfCentralDirectory(size, offset, entries) {
  const header = Buffer.alloc(22);

  // EOCD signature
  header.writeUInt32LE(0x06054b50, 0);
  // Number of this disk
  header.writeUInt16LE(0, 4);
  // Disk with central directory
  header.writeUInt16LE(0, 6);
  // Number of entries on this disk
  header.writeUInt16LE(entries, 8);
  // Total number of entries
  header.writeUInt16LE(entries, 10);
  // Size of central directory
  header.writeUInt32LE(size, 12);
  // Offset of start of central directory
  header.writeUInt32LE(offset, 16);
  // Comment length
  header.writeUInt16LE(0, 20);

  return header;
}

/**
 * Get all files recursively
 */
async function getAllFiles(dir) {
  const files = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath);
      files.push(...subFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files.sort(); // Sort for reproducible builds
}

/**
 * Validate the XPI file
 */
async function validateXPI(xpiPath) {
  console.log('🔍 Validating XPI...');

  // Check file exists and has reasonable size
  const stats = await fs.promises.stat(xpiPath);
  if (stats.size < 1000) {
    throw new Error('XPI file is too small, may be corrupted');
  }
  console.log(`  ✓ File size: ${formatBytes(stats.size)}`);

  // Verify it's a valid ZIP by checking signature
  const fd = await fs.promises.open(xpiPath, 'r');
  const buffer = Buffer.alloc(4);
  await fd.read(buffer, 0, 4, 0);
  await fd.close();

  // ZIP signature: 0x504B0304 (little endian bytes: 50 4B 03 04)
  if (buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`Invalid XPI file: not a valid ZIP archive (signature: 0x${buffer.toString('hex')})`);
  }
  console.log('  ✓ Valid ZIP format');

  console.log('');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Print success message
 */
function printSuccess(xpiPath, version) {
  const stats = fs.statSync(xpiPath);

  console.log('✅ Build successful!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Browser MCP Firefox Extension v${version}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📦 Output: ${xpiPath}`);
  console.log(`📏 Size:   ${formatBytes(stats.size)}\n`);
  console.log('🦊 Installation Instructions:');
  console.log('  1. Open Firefox Developer Edition');
  console.log('  2. Navigate to about:debugging');
  console.log('  3. Click "This Firefox" > "Load Temporary Add-on"');
  console.log(`  4. Select: ${xpiPath}`);
  console.log('  5. Extension will appear in toolbar\n');
  console.log('⚠️  Note: Regular Firefox requires signed extensions.');
  console.log('   Use Firefox Developer Edition for testing.\n');
}

// Run build
buildXPI();
