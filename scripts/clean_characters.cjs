const fs = require('fs');
const path = require('path');

const CHARACTERS_PATH = path.join(__dirname, '../src-tauri/resources/characters.json');

function cleanChineseName(nameZh, nameEn) {
  if (!nameZh || nameZh === 'null') {
    // If no chinese name, maybe try to extract from english if there's a known format?
    return null;
  }

  let cleaned = nameZh.trim();

  // 1. Remove redundant brackets in Chinese that matches English brackets
  // E.g., "001 (darling in the franxx)" -> "001" (if it's not a true Chinese translation inside the bracket)
  // Usually the bracket content specifies the franchise. We can remove it for a cleaner name.
  cleaned = cleaned.replace(/\s*[（\(].*?[）\)]\s*/g, '');

  // 2. Remove trailing spaces and commas
  cleaned = cleaned.replace(/[,，]\s*$/, '');
  
  return cleaned || null;
}

async function main() {
  console.log("Reading characters.json...");
  const data = fs.readFileSync(CHARACTERS_PATH, 'utf-8');
  const characters = JSON.parse(data);

  console.log(`Found ${characters.length} characters.`);
  let cleanedCount = 0;

  // Process characters
  for (const char of characters) {
    if (char.name_zh && char.name_zh !== 'null') {
      const original = char.name_zh;
      const cleaned = cleanChineseName(char.name_zh, char.name);
      
      if (cleaned !== original) {
        char.name_zh = cleaned;
        cleanedCount++;
      }
    }
  }

  console.log(`Cleaned ${cleanedCount} character names.`);
  
  console.log("Writing back to characters.json...");
  fs.writeFileSync(CHARACTERS_PATH, JSON.stringify(characters, null, 2), 'utf-8');
  
  console.log("Done!");
}

main().catch(console.error);
