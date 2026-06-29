const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../services/db');
const aiService = require('../services/ai');
const youtubeService = require('../services/youtube');

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
  // 1. /yardim
  {
    data: new SlashCommandBuilder()
      .setName('yardim')
      .setDescription('Botun tüm komutlarını ve açıklamalarını listeler.'),
    async execute(interaction) {
      const embed = new EmbedBuilder()
        .setTitle('📚 Discord & YouTube AI Botu Komut Menüsü')
        .setDescription('Aşağıda botun sahip olduğu 12 komut listelenmiştir:')
        .setColor('#0099FF')
        .addFields(
          { 
            name: '🎥 YouTube Komutları (10 Adet)', 
            value: `
\`/yardim\` - Bu menüyü gösterir.
\`/ping\` - Bot gecikmesini ölçer.
\`/yt-kanal-bagla [kanal]\` - Sunucunun varsayılan YouTube kanalını bağlar.
\`/yt-istatistik [kanal]\` - Kanal istatistiklerini getirir.
\`/yt-kanal-bilgi [kanal]\` - Detaylı kanal bilgilerini gösterir.
\`/yt-son-video [kanal]\` - Kanalın en son videosunu paylaşır.
\`/yt-ara [sorgu]\` - YouTube'da arama yapıp ilk videoyu getirir.
\`/yt-duyuru-sistemi [kanal] [discord-kanal]\` - Otomatik video bildirimlerini kurar ve kanalı sunucuya bağlar.
\`/yt-hedef [kanal] [hedef]\` - Abone hedefini gösterir ve ayarlar.
\`/yt-abone-sayaci [kanal] [discord-kanal]\` - Ses/metin kanalı adını canlı abone sayısı yapar.
`
          },
          {
            name: '🤖 Yapay Zeka Komutları (4 Adet)',
            value: `
\`/ai-ayarlar [sağlayıcı] [api-anahtarı]\` - Sunucuya özel yapay zeka ayarlarını test eder ve kaydeder (Yönetici).
\`/ai-kanal-analizi [kanal]\` - YouTube kanalını AI ile analiz edip büyüme önerileri sunar.
\`/ai-yorum-analizi [video]\` - Video yorumlarını AI ile analiz edip izleyici hissiyatı çıkartır.
\`/ai-video-ozeti [video]\` - YouTube videosunun başlık ve açıklamasını AI ile özetler.
`
          }
        )
        .setFooter({ text: 'Discord & YouTube Botu | Playing /help' })
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    }
  },

  // 2. /ping
  {
    data: new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Botun gecikme sürelerini ölçer.'),
    async execute(interaction) {
      const sent = await interaction.reply({ content: '⚡ Ping ölçülüyor...', fetchReply: true });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiPing = Math.round(interaction.client.ws.ping);
      
      await interaction.editReply(`📶 **Bot Gecikmesi:** \`${latency}ms\`\n🌐 **Discord API Gecikmesi:** \`${apiPing}ms\``);
    }
  },

  // 3. /ai-ayarlar
  {
    data: new SlashCommandBuilder()
      .setName('ai-ayarlar')
      .setDescription('Sunucuya özel AI sağlayıcısı ve API anahtarını tanımlar.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption(option => 
        option.setName('saglayici')
          .setDescription('Yapay Zeka Sağlayıcısı')
          .setRequired(true)
          .addChoices(
            { name: 'Google Gemini', value: 'gemini' },
            { name: 'Anthropic Claude', value: 'anthropic' }
          ))
      .addStringOption(option => 
        option.setName('api-anahtari')
          .setDescription('Seçilen sağlayıcıya ait API Anahtarı (API Key)')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      
      const provider = interaction.options.getString('saglayici');
      const apiKey = interaction.options.getString('api-anahtari');
      
      const providerName = provider === 'gemini' ? 'Google Gemini' : 'Anthropic Claude';
      
      try {
        await interaction.editReply({ content: `🔄 \`${providerName}\` API anahtarı test ediliyor, lütfen bekleyin...` });
        
        // API key'i test et
        await aiService.testApiKey(provider, apiKey);
        
        // Eğer başarılıysa veritabanına kaydet
        db.updateGuildData(interaction.guildId, {
          aiProvider: provider,
          aiApiKey: apiKey
        });
        
        await interaction.editReply({ 
          content: `✅ Yapay Zeka ayarları doğrulandı ve başarıyla kaydedildi!\n**Sağlayıcı:** \`${providerName}\`\n**API Anahtarı:** \`Sır olarak kaydedildi (••••••••)\`` 
        });
      } catch (error) {
        console.error('API Key test hatası:', error.message);
        await interaction.editReply({
          content: `❌ **API Anahtarı Doğrulanamadı!**\nGirilen API anahtarı veya sağlayıcı çalışmıyor. Bilgileri kontrol edip tekrar deneyin.\n\n**Hata:** \`${error.message}\``
        });
      }
    }
  },

  // 4. /ai-kanal-analizi
  {
    data: new SlashCommandBuilder()
      .setName('ai-kanal-analizi')
      .setDescription('YouTube kanalını AI ile analiz eder ve gelişim önerileri sunar.')
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
        return interaction.editReply('❌ Kanal detayları alınamadı.');
      }
      
      const { title, description, statistics } = channelData;
      const subCount = parseInt(statistics.subscriberCount).toLocaleString('tr-TR');
      const viewCount = parseInt(statistics.viewCount).toLocaleString('tr-TR');
      const videoCount = parseInt(statistics.videoCount).toLocaleString('tr-TR');
      
      const prompt = `Aşağıda bilgileri verilen YouTube kanalını analiz et. Kanalın içerik odağı nedir? Bu istatistiklere göre gelişim potansiyeli nedir? İzleyici kitlesini büyütmek, izlenmeleri artırmak ve toplulukla etkileşimi güçlendirmek için bu içerik üreticisine 5 adet somut, yaratıcı ve uygulanabilir tavsiye ver. Yanıtı tamamen Türkçe, samimi ama profesyonel bir üslupla ve maddeler halinde yaz.\n\nKanal İsmi: ${title}\nAçıklama: ${description || 'Belirtilmemiş'}\nAbone Sayısı: ${subCount}\nToplam İzlenme: ${viewCount}\nVideo Sayısı: ${videoCount}`;
      
      try {
        const analysis = await aiService.generateText(prompt, interaction.guildId);
        
        const embed = new EmbedBuilder()
          .setTitle(`🤖 AI Kanal Analizi: ${title}`)
          .setDescription(analysis.substring(0, 4000))
          .setColor('#9B59B6')
          .setTimestamp();
          
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await interaction.editReply(`❌ Yapay zeka analizi oluşturulamadı. Hata: ${err.message}`);
      }
    }
  },

  // 5. /ai-yorum-analizi
  {
    data: new SlashCommandBuilder()
      .setName('ai-yorum-analizi')
      .setDescription('Bir videoya gelen son yorumları analiz ederek seyirci hissiyatı raporu çıkarır.')
      .addStringOption(option => 
        option.setName('video-linki')
          .setDescription('YouTube Video Linki veya Video ID\'si')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const videoInput = interaction.options.getString('video-linki');
      
      let videoId = videoInput;
      if (videoInput.includes('youtu.be/')) {
        videoId = videoInput.split('youtu.be/')[1]?.split(/[?#]/)[0];
      } else if (videoInput.includes('youtube.com/watch')) {
        const urlParams = new URL(videoInput).searchParams;
        videoId = urlParams.get('v');
      }
      
      if (!videoId) {
        return interaction.editReply('❌ Geçerli bir YouTube videosu linki veya ID\'si giriniz.');
      }
      
      const comments = await youtubeService.getVideoComments(videoId);
      if (comments.length === 0) {
        return interaction.editReply('❌ Video yorumları çekilemedi (videonun yorumları kapalı olabilir).');
      }
      
      const commentsText = comments.map((c, i) => `${i+1}. ${c.snippet.topLevelComment.snippet.textDisplay}`).join('\n');
      
      const prompt = `Aşağıda bir YouTube videosuna gelen izleyici yorumları listelenmiştir. Bu yorumları analiz ederek şu soruları cevapla:\n1. Seyircilerin genel hissiyatı nasıldır? (Örn: %kaç olumlu, %kaç olumsuz veya nötr?)\n2. İzleyicilerin en çok beğendiği/övdüğü şeyler nelerdir?\n3. İzleyicilerin eleştirdiği veya geliştirilmesini istediği konular nelerdir?\n4. İzleyicilerin öne çıkan bir talebi (örn: yeni video konusu, düzeltme) var mı?\n\nYanıtı tamamen Türkçe, kısa, öz ve anlaşılır başlıklar halinde yaz.\n\nYorumlar:\n${commentsText}`;
      
      try {
        const analysis = await aiService.generateText(prompt, interaction.guildId);
        
        const embed = new EmbedBuilder()
          .setTitle('💬 AI İzleyici Yorum Analizi')
          .setDescription(analysis.substring(0, 4000))
          .setColor('#E67E22')
          .setTimestamp();
          
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await interaction.editReply(`❌ Yorum analizi başarısız oldu. Hata: ${err.message}`);
      }
    }
  },

  // 6. /ai-video-ozeti
  {
    data: new SlashCommandBuilder()
      .setName('ai-video-ozeti')
      .setDescription('Bir YouTube videosunun başlık ve açıklamasını kullanarak AI özeti çıkartır.')
      .addStringOption(option => 
        option.setName('video-linki')
          .setDescription('YouTube Video Linki veya Video ID\'si')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const videoInput = interaction.options.getString('video-linki');
      
      let videoId = videoInput;
      if (videoInput.includes('youtu.be/')) {
        videoId = videoInput.split('youtu.be/')[1]?.split(/[?#]/)[0];
      } else if (videoInput.includes('youtube.com/watch')) {
        const urlParams = new URL(videoInput).searchParams;
        videoId = urlParams.get('v');
      }
      
      if (!videoId) {
        return interaction.editReply('❌ Geçerli bir YouTube videosu linki veya ID\'si giriniz.');
      }
      
      const videoData = await youtubeService.getVideoDetails(videoId);
      if (!videoData) {
        return interaction.editReply('❌ Video detayları YouTube üzerinden alınamadı.');
      }
      
      const { title, description } = videoData.snippet;
      
      const prompt = `Aşağıda başlığı ve açıklaması verilen YouTube videosunun konusunu özetle. Videonun ana temasını, varsa öne çıkan başlıklarını ve ne anlatmak istediğini kısa, anlaşılır ve okuyucuyu sıkmayan 2-3 paragraf şeklinde özetle. Yanıt tamamen Türkçe olmalıdır.\n\nVideo Başlığı: ${title}\nAçıklama:\n${description}`;
      
      try {
        const summary = await aiService.generateText(prompt, interaction.guildId);
        
        const embed = new EmbedBuilder()
          .setTitle(`📝 AI Video Özeti: ${title}`)
          .setDescription(summary.substring(0, 4000))
          .setColor('#2ECC71')
          .setTimestamp();
          
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await interaction.editReply(`❌ Video özeti oluşturulamadı. Hata: ${err.message}`);
      }
    }
  }
];
