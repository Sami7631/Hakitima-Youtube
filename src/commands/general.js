const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../services/db');
const aiService = require('../services/ai');
const youtubeService = require('../services/youtube');

/**
 * Returns the provided channel ID if provided, otherwise the server's default youtubeChannelId
 */
async function getTargetChannelId(interaction, channelInput) {
  if (channelInput) {
    return await youtubeService.resolveChannelId(channelInput);
  }
  
  const guildConfig = db.getGuildData(interaction.guildId);
  return guildConfig.youtubeChannelId || null;
}

const noChannelErrorMessage = '❌ Please specify a channel or bind a default YouTube channel to your server using the `/yt-bind-channel` command.';

module.exports = [
  // 1. /help
  {
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all bot commands and descriptions.'),
    async execute(interaction) {
      const embed = new EmbedBuilder()
        .setTitle('📚 Discord & YouTube AI Bot Command Menu')
        .setDescription('Below are the 12 commands available for the bot:')
        .setColor('#0099FF')
        .addFields(
          { 
            name: '🎥 YouTube Commands (10)', 
            value: `
\`/help\` - Shows this menu.
\`/ping\` - Measures bot latency.
\`/yt-bind-channel [channel]\` - Binds the server's default YouTube channel.
\`/yt-statistics [channel]\` - Fetches channel statistics.
\`/yt-channel-info [channel]\` - Shows detailed channel information.
\`/yt-latest-video [channel]\` - Shares the latest video of the channel.
\`/yt-search [query]\` - Searches YouTube and fetches the first video.
\`/yt-announcement-system [channel] [discord-channel]\` - Sets up automated video notifications and binds the channel.
\`/yt-goal [channel] [goal]\` - Shows and sets a subscriber goal.
\`/yt-sub-counter [channel] [discord-channel]\` - Renames a voice/text channel to show live subscriber count.
`
          },
          {
            name: '🤖 AI & Settings Commands (5)',
            value: `
\`/ai-settings [provider] [api-key]\` - Tests and saves server-specific AI settings (Admin).
\`/ai-channel-analysis [channel]\` - Analyzes the YouTube channel with AI and provides growth suggestions.
\`/ai-comment-analysis [video]\` - Analyzes video comments with AI to extract viewer sentiment.
\`/ai-video-summary [video]\` - Summarizes a YouTube video's title and description with AI.
\`/command-channel [channel]\` - Restricts bot commands to a specific channel (Admin).
`
          }
        )
        .setFooter({ text: 'Discord & YouTube Bot | Playing /help' })
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    }
  },

  // 2. /ping
  {
    data: new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Measures the bot latency.'),
    async execute(interaction) {
      const sent = await interaction.reply({ content: '⚡ Measuring ping...', fetchReply: true });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiPing = Math.round(interaction.client.ws.ping);
      
      await interaction.editReply(`📶 **Bot Latency:** \`${latency}ms\`\n🌐 **Discord API Latency:** \`${apiPing}ms\``);
    }
  },

  // 3. /ai-settings
  {
    data: new SlashCommandBuilder()
      .setName('ai-settings')
      .setDescription('Sets the server-specific AI provider and API key.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption(option => 
        option.setName('provider')
          .setDescription('AI Provider')
          .setRequired(true)
          .addChoices(
            { name: 'Google Gemini', value: 'gemini' },
            { name: 'Anthropic Claude', value: 'anthropic' }
          ))
      .addStringOption(option => 
        option.setName('api-key')
          .setDescription('API Key for the selected provider')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      
      const provider = interaction.options.getString('provider');
      const apiKey = interaction.options.getString('api-key');
      
      const providerName = provider === 'gemini' ? 'Google Gemini' : 'Anthropic Claude';
      
      try {
        await interaction.editReply({ content: `🔄 Testing \`${providerName}\` API key, please wait...` });
        
        // Test the API key
        await aiService.testApiKey(provider, apiKey);
        
        // Save to DB if successful
        db.updateGuildData(interaction.guildId, {
          aiProvider: provider,
          aiApiKey: apiKey
        });
        
        await interaction.editReply({ 
          content: `✅ AI settings have been verified and saved successfully!\n**Provider:** \`${providerName}\`\n**API Key:** \`Saved secretly (••••••••)\`` 
        });
      } catch (error) {
        console.error('API Key test error:', error.message);
        await interaction.editReply({
          content: `❌ **API Key Verification Failed!**\nThe entered API key or provider is not working. Please check your credentials and try again.\n\n**Error:** \`${error.message}\``
        });
      }
    }
  },

  // 4. /ai-channel-analysis
  {
    data: new SlashCommandBuilder()
      .setName('ai-channel-analysis')
      .setDescription('Analyzes a YouTube channel with AI and provides growth suggestions.')
      .addStringOption(option => 
        option.setName('channel')
          .setDescription('Channel ID, @username or Channel Link (Uses bound channel if omitted)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const channelInput = interaction.options.getString('channel');
      
      const channelId = await getTargetChannelId(interaction, channelInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ Could not fetch channel details.');
      }
      
      const { title, description, statistics } = channelData;
      const subCount = parseInt(statistics.subscriberCount).toLocaleString('en-US');
      const viewCount = parseInt(statistics.viewCount).toLocaleString('en-US');
      const videoCount = parseInt(statistics.videoCount).toLocaleString('en-US');
      
      const prompt = `Analyze the YouTube channel given below. What is the focus of the channel? Based on these statistics, what is its growth potential? Provide 5 concrete, creative, and actionable tips to this content creator to grow their audience, increase views, and strengthen community engagement. Write the response entirely in English, in a friendly yet professional tone, and use bullet points.\n\nChannel Name: ${title}\nDescription: ${description || 'Not specified'}\nSubscribers: ${subCount}\nTotal Views: ${viewCount}\nVideo Count: ${videoCount}`;
      
      try {
        const analysis = await aiService.generateText(prompt, interaction.guildId);
        
        const embed = new EmbedBuilder()
          .setTitle(`🤖 AI Channel Analysis: ${title}`)
          .setDescription(analysis.substring(0, 4000))
          .setColor('#9B59B6')
          .setTimestamp();
          
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await interaction.editReply(`❌ Could not generate AI analysis. Error: ${err.message}`);
      }
    }
  },

  // 5. /ai-comment-analysis
  {
    data: new SlashCommandBuilder()
      .setName('ai-comment-analysis')
      .setDescription('Analyzes the latest comments on a video to generate a viewer sentiment report.')
      .addStringOption(option => 
        option.setName('video-link')
          .setDescription('YouTube Video Link or Video ID')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const videoInput = interaction.options.getString('video-link');
      
      let videoId = videoInput;
      if (videoInput.includes('youtu.be/')) {
        videoId = videoInput.split('youtu.be/')[1]?.split(/[?#]/)[0];
      } else if (videoInput.includes('youtube.com/watch')) {
        const urlParams = new URL(videoInput).searchParams;
        videoId = urlParams.get('v');
      }
      
      if (!videoId) {
        return interaction.editReply('❌ Please enter a valid YouTube video link or ID.');
      }
      
      const comments = await youtubeService.getVideoComments(videoId);
      if (comments.length === 0) {
        return interaction.editReply('❌ Could not fetch video comments (comments might be disabled).');
      }
      
      const commentsText = comments.map((c, i) => `${i+1}. ${c.snippet.topLevelComment.snippet.textDisplay}`).join('\n');
      
      const prompt = `Below are viewer comments on a YouTube video. Analyze these comments and answer the following questions:\n1. What is the overall sentiment of the audience? (e.g., what % positive, negative, or neutral?)\n2. What do the viewers like or praise the most?\n3. What are the topics viewers criticize or want improved?\n4. Is there any prominent request from the viewers (e.g., new video topic, corrections)?\n\nWrite the response entirely in English, with short, concise, and clear headings.\n\nComments:\n${commentsText}`;
      
      try {
        const analysis = await aiService.generateText(prompt, interaction.guildId);
        
        const embed = new EmbedBuilder()
          .setTitle('💬 AI Viewer Comment Analysis')
          .setDescription(analysis.substring(0, 4000))
          .setColor('#E67E22')
          .setTimestamp();
          
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await interaction.editReply(`❌ Comment analysis failed. Error: ${err.message}`);
      }
    }
  },

  // 6. /ai-video-summary
  {
    data: new SlashCommandBuilder()
      .setName('ai-video-summary')
      .setDescription('Generates an AI summary of a YouTube video using its title and description.')
      .addStringOption(option => 
        option.setName('video-link')
          .setDescription('YouTube Video Link or Video ID')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const videoInput = interaction.options.getString('video-link');
      
      let videoId = videoInput;
      if (videoInput.includes('youtu.be/')) {
        videoId = videoInput.split('youtu.be/')[1]?.split(/[?#]/)[0];
      } else if (videoInput.includes('youtube.com/watch')) {
        const urlParams = new URL(videoInput).searchParams;
        videoId = urlParams.get('v');
      }
      
      if (!videoId) {
        return interaction.editReply('❌ Please enter a valid YouTube video link or ID.');
      }
      
      const videoData = await youtubeService.getVideoDetails(videoId);
      if (!videoData) {
        return interaction.editReply('❌ Could not fetch video details from YouTube.');
      }
      
      const { title, description } = videoData.snippet;
      
      const prompt = `Summarize the topic of the YouTube video given below with its title and description. Summarize the main theme of the video, any prominent topics, and what it wants to convey in 2-3 short, clear, and engaging paragraphs. The response must be entirely in English.\n\nVideo Title: ${title}\nDescription:\n${description}`;
      
      try {
        const summary = await aiService.generateText(prompt, interaction.guildId);
        
        const embed = new EmbedBuilder()
          .setTitle(`📝 AI Video Summary: ${title}`)
          .setDescription(summary.substring(0, 4000))
          .setColor('#2ECC71')
          .setTimestamp();
          
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await interaction.editReply(`❌ Could not generate video summary. Error: ${err.message}`);
      }
    }
  },

  // 7. /command-channel
  {
    data: new SlashCommandBuilder()
      .setName('command-channel')
      .setDescription('Restricts bot commands to a single Discord channel.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption(option => 
        option.setName('channel')
          .setDescription('The text channel to restrict commands to (Leave empty to remove restriction)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const targetChannel = interaction.options.getChannel('channel');
      
      if (targetChannel) {
        db.updateGuildData(interaction.guildId, {
          botChannelId: targetChannel.id
        });
        
        await interaction.editReply({
          content: `✅ Bot commands have been successfully restricted to the ${targetChannel} channel. Commands typed in other channels will now be blocked.`
        });
      } else {
        db.updateGuildData(interaction.guildId, {
          botChannelId: null
        });
        
        await interaction.editReply({
          content: '✅ The channel restriction for bot commands has been removed. Commands can now be used in all channels.'
        });
      }
    }
  }
];
