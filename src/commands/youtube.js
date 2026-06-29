const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const youtubeService = require('../services/youtube');
const db = require('../services/db');

/**
 * Girdi varsa girdi çözümler, yoksa sunucunun kayıtlı youtubeChannelId değerini döndürür
 */
async function getTargetChannelId(interaction, kanalInput) {
  if (kanalInput) {
    return await youtubeService.resolveChannelId(kanalInput);
  }
  
  const guildConfig = db.getGuildData(interaction.guildId);
  return guildConfig.youtubeChannelId || null;
}

const noChannelErrorMessage = '❌ Lütfen bir kanal belirtin veya önce `/yt-duyuru-sistemi` komutu ile sunucunuza varsayılan bir YouTube kanalı bağlayın.';

module.exports = [
  // 1. /yt-istatistik
  {
    data: new SlashCommandBuilder()
      .setName('yt-istatistik')
      .setDescription('Bir YouTube kanalının abone, izlenme ve video istatistiklerini gösterir.')
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('Kanal ID, @kullanıcıadı veya Kanal Linki (Belirtilmezse bağlı kanal kullanılır)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const kanalInput = interaction.options.getString('kanal');
      
      const channelId = await getTargetChannelId(interaction, kanalInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ Kanal bilgileri alınamadı.');
      }
      
      const { title, description, thumbnails, customUrl } = channelData.snippet;
      const { subscriberCount, viewCount, videoCount } = channelData.statistics;
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${title} İstatistikleri`)
        .setURL(`https://youtube.com/${customUrl || 'channel/' + channelId}`)
        .setDescription(description ? (description.substring(0, 150) + '...') : 'Açıklama yok.')
        .setThumbnail(thumbnails?.high?.url || thumbnails?.default?.url)
        .addFields(
          { name: '👥 Abone Sayısı', value: parseInt(subscriberCount).toLocaleString('tr-TR'), inline: true },
          { name: '👁️ Toplam İzlenme', value: parseInt(viewCount).toLocaleString('tr-TR'), inline: true },
          { name: '🎥 Toplam Video', value: parseInt(videoCount).toLocaleString('tr-TR'), inline: true }
        )
        .setColor('#FF0000')
        .setFooter({ text: 'YouTube İstatistikleri', iconURL: 'https://i.imgur.com/8Q5FqWJ.png' })
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 2. /yt-kanal-bilgi
  {
    data: new SlashCommandBuilder()
      .setName('yt-kanal-bilgi')
      .setDescription('Bir YouTube kanalının detaylı künye bilgilerini gösterir.')
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('Kanal ID, @kullanıcıadı veya Kanal Linki (Belirtilmezse bağlı kanal kullanılır)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const kanalInput = interaction.options.getString('kanal');
      
      const channelId = await getTargetChannelId(interaction, kanalInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ Kanal bilgileri alınamadı.');
      }
      
      const { title, description, publishedAt, country, thumbnails, customUrl } = channelData.snippet;
      
      const embed = new EmbedBuilder()
        .setTitle(`ℹ️ ${title} Kanal Bilgileri`)
        .setURL(`https://youtube.com/${customUrl || 'channel/' + channelId}`)
        .setDescription(description || 'Açıklama belirtilmemiş.')
        .setThumbnail(thumbnails?.high?.url)
        .addFields(
          { name: '📅 Kuruluş Tarihi', value: new Date(publishedAt).toLocaleDateString('tr-TR'), inline: true },
          { name: '🌍 Ülke', value: country || 'Belirtilmemiş', inline: true },
          { name: '🆔 Kanal ID', value: `\`${channelId}\``, inline: false }
        )
        .setColor('#FF0000')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 3. /yt-son-video
  {
    data: new SlashCommandBuilder()
      .setName('yt-son-video')
      .setDescription('Bir YouTube kanalının yayınladığı en son videoyu getirir.')
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('Kanal ID, @kullanıcıadı veya Kanal Linki (Belirtilmezse bağlı kanal kullanılır)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const kanalInput = interaction.options.getString('kanal');
      
      const channelId = await getTargetChannelId(interaction, kanalInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const latestVideo = await youtubeService.getLatestVideo(channelId);
      if (!latestVideo) {
        return interaction.editReply('❌ Kanalda yüklü herhangi bir video bulunamadı veya bilgi alınamadı.');
      }
      
      const { title, resourceId, publishedAt, thumbnails } = latestVideo.snippet;
      const videoId = resourceId.videoId;
      
      const embed = new EmbedBuilder()
        .setTitle(`🎥 En Son Video: ${title}`)
        .setURL(`https://youtu.be/${videoId}`)
        .setImage(thumbnails?.maxres?.url || thumbnails?.high?.url || thumbnails?.medium?.url)
        .addFields(
          { name: '📅 Yayınlanma Tarihi', value: new Date(publishedAt).toLocaleString('tr-TR'), inline: true },
          { name: '🔗 Video Linki', value: `https://youtu.be/${videoId}`, inline: true }
        )
        .setColor('#FF0000')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed], content: `https://youtu.be/${videoId}` });
    }
  },

  // 4. /yt-ara
  {
    data: new SlashCommandBuilder()
      .setName('yt-ara')
      .setDescription('YouTube üzerinde arama yapıp ilk eşleşen videoyu getirir.')
      .addStringOption(option => 
        option.setName('sorgu')
          .setDescription('Aranacak kelimeler')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const query = interaction.options.getString('sorgu');
      
      const video = await youtubeService.searchVideos(query);
      if (!video) {
        return interaction.editReply('❌ Arama sonucunda hiç video bulunamadı.');
      }
      
      const videoId = video.id.videoId;
      await interaction.editReply({ content: `🔍 **Arama Sonucu:** https://youtu.be/${videoId}` });
    }
  },

  // 5. /yt-duyuru-sistemi (Kurulum ve Bağlama)
  {
    data: new SlashCommandBuilder()
      .setName('yt-duyuru-sistemi')
      .setDescription('Sunucuda otomatik yeni video bildirimini kurar ve bu kanalı sunucuya bağlar.')
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('Takip edilecek YouTube Kanal ID, @kullanıcıadı veya Linki')
          .setRequired(true))
      .addChannelOption(option => 
        option.setName('bildirim-kanali')
          .setDescription('Bildirimlerin atılacağı Discord metin kanalı')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const kanalInput = interaction.options.getString('kanal');
      const notifyChannel = interaction.options.getChannel('bildirim-kanali');
      
      const channelId = await youtubeService.resolveChannelId(kanalInput);
      if (!channelId) {
        return interaction.editReply('❌ Kanal bulunamadı.');
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ YouTube kanal bilgileri doğrulanamadı.');
      }
      
      const latestVideo = await youtubeService.getLatestVideo(channelId);
      const lastVideoId = latestVideo ? latestVideo.snippet.resourceId.videoId : null;
      
      db.updateGuildData(interaction.guildId, {
        youtubeChannelId: channelId,
        notifyChannelId: notifyChannel.id,
        lastVideoId: lastVideoId
      });
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Duyuru Sistemi Aktif Edildi!')
        .setDescription(`Bundan sonra **${channelData.snippet.title}** kanalı sunucuya varsayılan olarak bağlanmıştır.\n\nYeni bir video yüklendiğinde, ${notifyChannel} kanalına otomatik duyuru atılacaktır.`)
        .setColor('#00FF00')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 6. /yt-canli-yayin
  {
    data: new SlashCommandBuilder()
      .setName('yt-canli-yayin')
      .setDescription('Bir YouTube kanalının şu an canlı yayında olup olmadığını kontrol eder.')
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('Kanal ID, @kullanıcıadı veya Kanal Linki (Belirtilmezse bağlı kanal kullanılır)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const kanalInput = interaction.options.getString('kanal');
      
      const channelId = await getTargetChannelId(interaction, kanalInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      try {
        const { google } = require('googleapis');
        const youtubeClient = google.youtube({
          version: 'v3',
          auth: process.env.YOUTUBE_API_KEY
        });
        
        const response = await youtubeClient.search.list({
          part: 'snippet',
          channelId: channelId,
          type: 'video',
          eventType: 'live',
          maxResults: 1
        });
        
        if (response.data.items && response.data.items.length > 0) {
          const liveVideo = response.data.items[0];
          const embed = new EmbedBuilder()
            .setTitle(`🔴 CANLI YAYIN: ${liveVideo.snippet.title}`)
            .setDescription(`**${liveVideo.snippet.channelTitle}** şu an canlı yayında!`)
            .setURL(`https://youtube.com/watch?v=${liveVideo.id.videoId}`)
            .setImage(liveVideo.snippet.thumbnails?.high?.url)
            .setColor('#FF0000')
            .setTimestamp();
            
          return interaction.editReply({ embeds: [embed], content: `🔴 https://youtube.com/watch?v=${liveVideo.id.videoId}` });
        } else {
          return interaction.editReply('ℹ️ Bu kanal şu anda canlı yayında değil.');
        }
      } catch (error) {
        console.error(error);
        return interaction.editReply('❌ Canlı yayın kontrolü sırasında bir hata oluştu.');
      }
    }
  },

  // 7. /yt-hedef
  {
    data: new SlashCommandBuilder()
      .setName('yt-hedef')
      .setDescription('Kanalın abone hedefini ve ilerlemesini gösterir.')
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('Kanal ID, @kullanıcıadı veya Kanal Linki (Belirtilmezse bağlı kanal kullanılır)')
          .setRequired(false))
      .addIntegerOption(option => 
        option.setName('abone-hedefi')
          .setDescription('Hedeflenen abone sayısı (örn: 10000)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const kanalInput = interaction.options.getString('kanal');
      const targetInput = interaction.options.getInteger('abone-hedefi');
      
      const channelId = await getTargetChannelId(interaction, kanalInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ Kanal bilgileri alınamadı.');
      }
      
      const currentSubs = parseInt(channelData.statistics.subscriberCount);
      
      let goal = targetInput;
      if (goal) {
        db.updateGuildData(interaction.guildId, {
          subscriberGoal: channelId,
          subscriberGoalValue: goal
        });
      } else {
        const guildData = db.getGuildData(interaction.guildId);
        if (guildData.subscriberGoal === channelId) {
          goal = guildData.subscriberGoalValue;
        } else {
          goal = currentSubs + 1000;
        }
      }
      
      const percent = Math.min(Math.round((currentSubs / goal) * 100), 100);
      const barLength = 15;
      const filledLength = Math.round((percent / 100) * barLength);
      const emptyLength = barLength - filledLength;
      const progressBar = '🟩'.repeat(filledLength) + '⬜'.repeat(emptyLength);
      
      const embed = new EmbedBuilder()
        .setTitle(`🎯 Abone Hedefi: ${channelData.snippet.title}`)
        .setDescription(`
**Mevcut Abone:** ${currentSubs.toLocaleString('tr-TR')}
**Hedeflenen:** ${goal.toLocaleString('tr-TR')}
**İlerleme:** %${percent}

${progressBar}
`)
        .setColor(percent >= 100 ? '#00FF00' : '#FFA500')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 8. /yt-abone-sayaci
  {
    data: new SlashCommandBuilder()
      .setName('yt-abone-sayaci')
      .setDescription('Ses/Metin kanalının adını otomatik olarak canlı abone sayısı yapacak şekilde kurar.')
      .addChannelOption(option => 
        option.setName('sayac-kanali')
          .setDescription('Adı değiştirilecek ses kanalı veya metin kanalı')
          .setRequired(true))
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('YouTube Kanal ID, @kullanıcıadı veya Linki (Belirtilmezse bağlı kanal kullanılır)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const counterChannel = interaction.options.getChannel('sayac-kanali');
      const kanalInput = interaction.options.getString('kanal');
      
      const channelId = await getTargetChannelId(interaction, kanalInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ Kanal bilgileri alınamadı.');
      }
      
      const currentSubs = parseInt(channelData.statistics.subscriberCount);
      const newName = `👥 Abone: ${currentSubs.toLocaleString('tr-TR')}`;
      
      try {
        await counterChannel.setName(newName);
      } catch (err) {
        console.error('Kanal adı güncelleme hatası:', err.message);
        return interaction.editReply('❌ Kanal ismi güncellenemedi. Botun bu kanalı yönetme (Manage Channels) yetkisinin olduğundan emin olun.');
      }
      
      db.updateGuildData(interaction.guildId, {
        subscriberGoal: channelId,
        subscriberCounterChannelId: counterChannel.id
      });
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Abone Sayacı Başarıyla Kuruldu!')
        .setDescription(`${counterChannel} kanalı başarıyla bağlandı. Kanal adı her 10 dakikada bir otomatik güncellenecektir.\n\nYeni ad: \`${newName}\``)
        .setColor('#00FF00')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 9. /yt-kanal-bagla
  {
    data: new SlashCommandBuilder()
      .setName('yt-kanal-bagla')
      .setDescription('Sunucunun varsayılan YouTube kanalını bağlar (Duyuru sistemi kurmadan).')
      .addStringOption(option => 
        option.setName('kanal')
          .setDescription('Bağlanacak YouTube Kanal ID, @kullanıcıadı veya Linki')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const kanalInput = interaction.options.getString('kanal');
      
      const channelId = await youtubeService.resolveChannelId(kanalInput);
      if (!channelId) {
        return interaction.editReply('❌ Kanal bulunamadı.');
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ YouTube kanal bilgileri doğrulanamadı.');
      }
      
      db.updateGuildData(interaction.guildId, {
        youtubeChannelId: channelId
      });
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Varsayılan Kanal Bağlandı!')
        .setDescription(`**${channelData.snippet.title}** kanalı bu sunucu için varsayılan YouTube kanalı olarak ayarlandı.`)
        .setColor('#00FF00')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  }
];
