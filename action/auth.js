const fs = require('fs');
const path = require('path');
require('dotenv').config(); //

const session = process.env.SESSION || '';

async function authentication() {
  const sessionDir = path.join(__dirname, '../Sessions');
  const credsFile = path.join(sessionDir, 'creds.json');

  try {
    // 1. Ensure the directory exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // 2. Only process if credentials are missing
    if (!fs.existsSync(credsFile)) {
      if (!session) return console.log('❌ No SESSION ID found in .env');

      // HYBRID LOGIC: Detect format
      if (session.includes(";;;") || session.length > 100) {
        // CASE A: Direct Base64 String (like yours)
        console.log('🛠️ Detected direct Base64 session string. Processing...');
        
        // Remove prefix if present (e.g., BLACK MD;;;)
        const base64Data = session.includes(";;;") ? session.split(";;;")[1] : session;
        
        // Use Buffer to decode reliably for Node.js
        const decryptedData = Buffer.from(base64Data.trim(), 'base64').toString('utf-8');
        
        // Use Synchronous write to ensure file is ready before Baileys starts
        fs.writeFileSync(credsFile, decryptedData);
        console.log("✅ Credentials injected successfully from .env string!");
        
      } else {
        // CASE B: Mega.nz ID
        console.log('⏳ Detected Mega ID. Attempting download...');
        const sessdata = session.replace("TECH WORLD 401", '').trim();
        const { File } = require('megajs');
        
        const filer = await File.fromURL(`https://mega.nz/file/${sessdata}`);
        const data = await new Promise((resolve, reject) => {
          filer.download((err, data) => err ? reject(err) : resolve(data));
        });
        
        fs.writeFileSync(credsFile, data);
        console.log("✅ Session downloaded from Mega successfully!");
      }
    }
  } catch (err) {
    console.log("❌ Authentication processing failed: " + err.message);
  }
}

module.exports = authentication;
