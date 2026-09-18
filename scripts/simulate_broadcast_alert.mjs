// Simulation script: Sends a real-world, high-fidelity Cablecast broadcast alert to Ammar's Telegram
const token = process.env.TELEGRAM_BOT_TOKEN || '8664842640:AAGVdcifL6ApA0LmULehhMTNWSKa-B31cP0';
const chatId = process.env.TELEGRAM_CHAT_ID || '8703799442';

// High-res poster for Batman: The Animated Series / The X-Files
const posterUrl = 'https://image.tmdb.org/t/p/w780/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg';

const caption = `📺 <b>CABLECAST · APPOINTMENT BROADCAST</b>
━━━━━━━━━━━━━━━━━━━━
🔴 <b>AIRING IN 10 MINUTES · 10:00 AM</b>
📡 <b>Channel 04</b> · <i>Retro Mystery Lineup</i>

🎬 <b>The X-Files</b> (1993)
📼 <b>Season 1, Ep. 1 · "Pilot"</b>
⭐ <b>8.7 / 10</b>  ·  ⏱ <b>48 mins</b>  ·  🏷 <i>Sci-Fi, Mystery, Cult</i>

<blockquote>"Agent Dana Scully is assigned to debunk the FBI's anomalous unclassified cold cases alongside eccentric investigator Fox Mulder."</blockquote>
━━━━━━━━━━━━━━━━━━━━
📼 <b>VHS Status:</b> Hi-Fi Stereo · 4:3 CRT Master
🔔 <i>You have appointment reminders active.</i>`;

const payload = {
  chat_id: chatId,
  photo: posterUrl,
  caption: caption,
  parse_mode: 'HTML',
  reply_markup: {
    inline_keyboard: [
      [
        { text: '▶️ Tune In Live (Channel 04)', url: 'https://cablecast.tv/?view=home#schedule' }
      ],
      [
        { text: '📼 View VHS Sleeve', url: 'https://cablecast.tv/library' },
        { text: '🗓 Full TV Guide', url: 'https://cablecast.tv/broadcast' }
      ]
    ]
  }
};

async function run() {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  console.log('Simulation response:', data);
}

run();
