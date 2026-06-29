require('dotenv').config();
const http = require('http');

// Bulut sunucuları (Koyeb, Render vb.) için port bağlama ve sağlık testi sunucusu
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🤖 Discord Bot aktif ve 7/24 çalışıyor!');
}).listen(PORT, () => {
  console.log(`📡 Port dinleniyor: ${PORT} (Bulut sunucu uyumluluğu aktif)`);
});

const { Client, GatewayIntentBits, ActivityType, Collection, EmbedBuilder } = require('discord.js');
const db = require('./services/db');
const youtubeService = require('./services/youtube');

// Discord İstemcisini oluştur
// Sadece slash komutları ve ses/metin kanallarını yönetmek için Guilds yeterlidir.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// Komutları topla (Toplam 12 komut)
const commandsList = [
  ...require('./commands/youtube'),
  ...require('./commands/general')
];

client.commands = new Collection();
for (const cmd of commandsList) {
  client.commands.set(cmd.data.name, cmd);
}

// Bot hazır olduğunda
client.once('ready', async () => {
  console.log(`🤖 Bot başarıyla giriş yaptı: ${client.user.tag}`);
  
  // Oynuyor durumunu '/help' yap
  client.user.setActivity('/help', { type: ActivityType.Playing });
  
  // Slash komutlarını global olarak Discord'a kaydet
  try {
    console.log('Slash komutları Discord API\'ye kaydediliyor...');
    await client.application.commands.set(commandsList.map(c => c.data.toJSON()));
    console.log('✅ Tüm slash komutları başarıyla kaydedildi!');
  } catch (error) {
    console.error('❌ Slash komutları kaydedilirken hata oluştu:', error);
  }

  // Zamanlayıcıları (YouTube Video & Abone Kontrolü) başlat
  startBackgroundTasks();
});

// Slash Komut Etkileşimlerini Dinle
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Komut yürütme hatası (${interaction.commandName}):`, error);
    const errorMsg = '❌ Bu komut çalıştırılırken bir hata oluştu!';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
    }
  }
});

/**
 * Arka Plan İşleri (YouTube Video Kontrolü ve Canlı Abone Sayacı)
 */
function startBackgroundTasks() {
  console.log('⏰ Arka plan görevleri başlatıldı.');

  // YouTube Video ve Abone Kontrolü (Her 8 dakikada bir)
  // Discord kanal adı değiştirme limiti (10 dakikada 2 kez) sebebiyle 8 dakika idealdir.
  setInterval(async () => {
    console.log('🔄 YouTube yeni video ve abone sayacı güncelleniyor...');
    const data = db.readDb();
    
    for (const [guildId, guildConfig] of Object.entries(data.guilds)) {
      if (!guildConfig.youtubeChannelId) continue;
      
      try {
        // A. Yeni Video Kontrolü
        if (guildConfig.notifyChannelId) {
          const latestVideo = await youtubeService.getLatestVideo(guildConfig.youtubeChannelId);
          if (latestVideo) {
            const videoId = latestVideo.snippet.resourceId.videoId;
            
            // Eğer yeni bir video tespit edildiyse duyuru yap
            if (videoId && videoId !== guildConfig.lastVideoId) {
              const channel = await client.channels.fetch(guildConfig.notifyChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const { title, thumbnails } = latestVideo.snippet;
                const embed = new EmbedBuilder()
                  .setTitle(`🔔 YENİ VİDEO YAYINLANDI!`)
                  .setDescription(`**${latestVideo.snippet.channelTitle}** yeni bir video yükledi:\n\n🎥 **${title}**`)
                  .setURL(`https://youtu.be/${videoId}`)
                  .setImage(thumbnails?.high?.url || thumbnails?.medium?.url)
                  .setColor('#FF0000')
                  .setTimestamp();
                  
                await channel.send({ content: `@everyone Yeni video yayında! 🚀 https://youtu.be/${videoId}`, embeds: [embed] });
                
                // Son video ID'sini güncelle
                db.updateGuildData(guildId, { lastVideoId: videoId });
              }
            }
          }
        }
        
        // B. Canlı Abone Sayacı Güncellemesi
        if (guildConfig.subscriberCounterChannelId) {
          const channelDetails = await youtubeService.getChannelDetails(guildConfig.youtubeChannelId);
          if (channelDetails) {
            const subCount = parseInt(channelDetails.statistics.subscriberCount);
            const channel = await client.channels.fetch(guildConfig.subscriberCounterChannelId).catch(() => null);
            
            if (channel) {
              const currentName = channel.name;
              const expectedName = `👥 Abone: ${subCount.toLocaleString('tr-TR')}`;
              
              // Sadece isim farklıysa güncelle (gereksiz Discord API çağrısını önler)
              if (currentName !== expectedName) {
                await channel.setName(expectedName).catch(err => {
                  console.error(`Kanal adı güncellenemedi (${guildId}):`, err.message);
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`YouTube otomatik kontrol hatası (Guild: ${guildId}):`, error.message);
      }
    }
  }, 8 * 60 * 1000);
}

// Botu başlat
client.login(process.env.DISCORD_TOKEN);
