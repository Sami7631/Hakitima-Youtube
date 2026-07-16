const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const youtubeService = require('../services/youtube');
const db = require('../services/db');

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
  // 1. /yt-statistics
  {
    data: new SlashCommandBuilder()
      .setName('yt-statistics')
      .setDescription('Shows the subscriber, view, and video statistics of a YouTube channel.')
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
        return interaction.editReply('❌ Could not fetch channel information.');
      }
      
      const { title, description, thumbnails, customUrl } = channelData.snippet;
      const { subscriberCount, viewCount, videoCount } = channelData.statistics;
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${title} Statistics`)
        .setURL(`https://youtube.com/${customUrl || 'channel/' + channelId}`)
        .setDescription(description ? (description.substring(0, 150) + '...') : 'No description.')
        .setThumbnail(thumbnails?.high?.url || thumbnails?.default?.url)
        .addFields(
          { name: '👥 Subscribers', value: parseInt(subscriberCount).toLocaleString('en-US'), inline: true },
          { name: '👁️ Total Views', value: parseInt(viewCount).toLocaleString('en-US'), inline: true },
          { name: '🎥 Total Videos', value: parseInt(videoCount).toLocaleString('en-US'), inline: true }
        )
        .setColor('#FF0000')
        .setFooter({ text: 'YouTube Statistics', iconURL: 'https://i.imgur.com/8Q5FqWJ.png' })
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 2. /yt-channel-info
  {
    data: new SlashCommandBuilder()
      .setName('yt-channel-info')
      .setDescription('Shows detailed information about a YouTube channel.')
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
        return interaction.editReply('❌ Could not fetch channel information.');
      }
      
      const { title, description, publishedAt, country, thumbnails, customUrl } = channelData.snippet;
      
      const embed = new EmbedBuilder()
        .setTitle(`ℹ️ ${title} Channel Info`)
        .setURL(`https://youtube.com/${customUrl || 'channel/' + channelId}`)
        .setDescription(description || 'No description provided.')
        .setThumbnail(thumbnails?.high?.url)
        .addFields(
          { name: '📅 Created At', value: new Date(publishedAt).toLocaleDateString('en-US'), inline: true },
          { name: '🌍 Country', value: country || 'Not specified', inline: true },
          { name: '🆔 Channel ID', value: `\`${channelId}\``, inline: false }
        )
        .setColor('#FF0000')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 3. /yt-latest-video
  {
    data: new SlashCommandBuilder()
      .setName('yt-latest-video')
      .setDescription('Fetches the latest uploaded video of a YouTube channel.')
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
      
      const latestVideo = await youtubeService.getLatestVideo(channelId);
      if (!latestVideo) {
        return interaction.editReply('❌ No uploaded videos found or could not fetch data.');
      }
      
      const { title, resourceId, publishedAt, thumbnails } = latestVideo.snippet;
      const videoId = resourceId.videoId;
      
      const embed = new EmbedBuilder()
        .setTitle(`🎥 Latest Video: ${title}`)
        .setURL(`https://youtu.be/${videoId}`)
        .setImage(thumbnails?.maxres?.url || thumbnails?.high?.url || thumbnails?.medium?.url)
        .addFields(
          { name: '📅 Published At', value: new Date(publishedAt).toLocaleString('en-US'), inline: true },
          { name: '🔗 Video Link', value: `https://youtu.be/${videoId}`, inline: true }
        )
        .setColor('#FF0000')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed], content: `https://youtu.be/${videoId}` });
    }
  },

  // 4. /yt-search
  {
    data: new SlashCommandBuilder()
      .setName('yt-search')
      .setDescription('Searches YouTube and fetches the first matching video.')
      .addStringOption(option => 
        option.setName('query')
          .setDescription('Search query')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const query = interaction.options.getString('query');
      
      const video = await youtubeService.searchVideos(query);
      if (!video) {
        return interaction.editReply('❌ No videos found for the search query.');
      }
      
      const videoId = video.id.videoId;
      await interaction.editReply({ content: `🔍 **Search Result:** https://youtu.be/${videoId}` });
    }
  },

  // 5. /yt-announcement-system (Setup and Bind)
  {
    data: new SlashCommandBuilder()
      .setName('yt-announcement-system')
      .setDescription('Sets up automated new video notifications and binds the channel to the server.')
      .addStringOption(option => 
        option.setName('channel')
          .setDescription('YouTube Channel ID, @username or Link to track')
          .setRequired(true))
      .addChannelOption(option => 
        option.setName('notification-channel')
          .setDescription('Discord text channel for notifications')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const channelInput = interaction.options.getString('channel');
      const notifyChannel = interaction.options.getChannel('notification-channel');
      
      const channelId = await youtubeService.resolveChannelId(channelInput);
      if (!channelId) {
        return interaction.editReply('❌ Channel not found.');
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ YouTube channel details could not be verified.');
      }
      
      const latestVideo = await youtubeService.getLatestVideo(channelId);
      const lastVideoId = latestVideo ? latestVideo.snippet.resourceId.videoId : null;
      
      db.updateGuildData(interaction.guildId, {
        youtubeChannelId: channelId,
        notifyChannelId: notifyChannel.id,
        lastVideoId: lastVideoId
      });
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Announcement System Activated!')
        .setDescription(`From now on, the **${channelData.snippet.title}** channel is bound to this server by default.\n\nWhen a new video is uploaded, an automated announcement will be sent to the ${notifyChannel} channel.`)
        .setColor('#00FF00')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 6. /yt-live-stream
  {
    data: new SlashCommandBuilder()
      .setName('yt-live-stream')
      .setDescription('Checks if a YouTube channel is currently live.')
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
            .setTitle(`🔴 LIVE STREAM: ${liveVideo.snippet.title}`)
            .setDescription(`**${liveVideo.snippet.channelTitle}** is currently live!`)
            .setURL(`https://youtube.com/watch?v=${liveVideo.id.videoId}`)
            .setImage(liveVideo.snippet.thumbnails?.high?.url)
            .setColor('#FF0000')
            .setTimestamp();
            
          return interaction.editReply({ embeds: [embed], content: `🔴 https://youtube.com/watch?v=${liveVideo.id.videoId}` });
        } else {
          return interaction.editReply('ℹ️ This channel is not currently live.');
        }
      } catch (error) {
        console.error(error);
        return interaction.editReply('❌ An error occurred while checking live stream status.');
      }
    }
  },

  // 7. /yt-goal
  {
    data: new SlashCommandBuilder()
      .setName('yt-goal')
      .setDescription('Shows the channel subscriber goal and progress.')
      .addStringOption(option => 
        option.setName('channel')
          .setDescription('Channel ID, @username or Channel Link (Uses bound channel if omitted)')
          .setRequired(false))
      .addIntegerOption(option => 
        option.setName('subscriber-goal')
          .setDescription('Target subscriber count (e.g., 10000)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const channelInput = interaction.options.getString('channel');
      const targetInput = interaction.options.getInteger('subscriber-goal');
      
      const channelId = await getTargetChannelId(interaction, channelInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ Could not fetch channel information.');
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
        .setTitle(`🎯 Subscriber Goal: ${channelData.snippet.title}`)
        .setDescription(`
**Current Subs:** ${currentSubs.toLocaleString('en-US')}
**Goal:** ${goal.toLocaleString('en-US')}
**Progress:** ${percent}%

${progressBar}
`)
        .setColor(percent >= 100 ? '#00FF00' : '#FFA500')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 8. /yt-sub-counter
  {
    data: new SlashCommandBuilder()
      .setName('yt-sub-counter')
      .setDescription('Sets a voice/text channel name to automatically display live subscriber count.')
      .addChannelOption(option => 
        option.setName('counter-channel')
          .setDescription('The voice or text channel to rename')
          .setRequired(true))
      .addStringOption(option => 
        option.setName('channel')
          .setDescription('YouTube Channel ID, @username or Link (Uses bound channel if omitted)')
          .setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const counterChannel = interaction.options.getChannel('counter-channel');
      const channelInput = interaction.options.getString('channel');
      
      const channelId = await getTargetChannelId(interaction, channelInput);
      if (!channelId) {
        return interaction.editReply(noChannelErrorMessage);
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ Could not fetch channel information.');
      }
      
      const currentSubs = parseInt(channelData.statistics.subscriberCount);
      const newName = `👥 Subs: ${currentSubs.toLocaleString('en-US')}`;
      
      try {
        await counterChannel.setName(newName);
      } catch (err) {
        console.error('Channel rename error:', err.message);
        return interaction.editReply('❌ Could not rename the channel. Ensure the bot has "Manage Channels" permission for this channel.');
      }
      
      db.updateGuildData(interaction.guildId, {
        subscriberGoal: channelId,
        subscriberCounterChannelId: counterChannel.id
      });
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Subscriber Counter Successfully Set Up!')
        .setDescription(`The ${counterChannel} channel has been successfully bound. The channel name will automatically update every 10 minutes.\n\nNew name: \`${newName}\``)
        .setColor('#00FF00')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  // 9. /yt-bind-channel
  {
    data: new SlashCommandBuilder()
      .setName('yt-bind-channel')
      .setDescription('Binds the default YouTube channel for the server (without setting up announcements).')
      .addStringOption(option => 
        option.setName('channel')
          .setDescription('YouTube Channel ID, @username or Link to bind')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const channelInput = interaction.options.getString('channel');
      
      const channelId = await youtubeService.resolveChannelId(channelInput);
      if (!channelId) {
        return interaction.editReply('❌ Channel not found.');
      }
      
      const channelData = await youtubeService.getChannelDetails(channelId);
      if (!channelData) {
        return interaction.editReply('❌ YouTube channel details could not be verified.');
      }
      
      db.updateGuildData(interaction.guildId, {
        youtubeChannelId: channelId
      });
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Default Channel Bound!')
        .setDescription(`**${channelData.snippet.title}** has been set as the default YouTube channel for this server.`)
        .setColor('#00FF00')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  }
];
