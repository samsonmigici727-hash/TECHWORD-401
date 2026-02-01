/* If it works, don't Fix it */

require('dotenv').config();
const {
  default: ravenConnect,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require('path');
const qrcode = require('qrcode-terminal');
const authentication = require('./action/auth'); 
const { session, mode, port, prefix } = require("./set.js");

// FIX: Case sensitivity for Store folder
const makeInMemoryStore = require('./Store/store.js'); 
const store = makeInMemoryStore({ logger: pino({ level: "silent" }).child({ stream: 'store' }) });

async function startRaven() {
  // 1. Run the authentication logic first
  await authentication();  
  
  // 2. Load auth state from "Sessions"
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'Sessions'));
  const { version } = await fetchLatestBaileysVersion();
  
  const client = ravenConnect({
    version,
    logger: pino({ level: "silent" }),
    browser: ["TECH - AI", "Safari", "5.1.7"],
    auth: state,
    printQRInTerminal: false, // Handled manually below
  });

  // 🛠️ FIX: Define decodeJid IMMEDIATELY so smsg doesn't crash
  client.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };

  store.bind(client.ev);
  
  client.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
        console.log("⚠️ Scan this QR if your .env session failed:");
        qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Connection lost. Reconnecting in 5s...");
        setTimeout(() => startRaven(), 5000); 
      } else {
        console.log("Logged out. Delete Sessions folder and restart.");
      }
    } else if (connection === 'open') {
      console.log("✅ TECH WORLD 401 CONNECTED");
      const status = `✅ *CONNECTED*\n\n👤 *User:* ${client.user.id.split(':')[0]}\n👥 *Mode:* ${mode}\n🔖 *Prefix:* ${prefix || 'None'}`;
      await client.sendMessage(client.user.id, { text: status });
    }
  });
  
  client.ev.on("creds.update", saveCreds);

  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const mek = chatUpdate.messages[0];
      if (!mek.message) return;
      if (mek.key && mek.key.remoteJid === 'status@broadcast') return;

      const { smsg } = require('./lib/ravenfunc');
      const raven = require("./blacks");
      
      // Clean up message object
      let m = smsg(client, mek, store);
      
      // Pass to command handler
      raven(client, m, chatUpdate, store);
    } catch (err) {
      console.error("Error in messages.upsert:", err);
    }
  });

  return client;
}

// Start server for Panel compatibility
const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot is Running..."));
app.listen(port, () => console.log(`Server listening on port ${port}`));

startRaven();
