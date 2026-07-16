require('dotenv').config();
const http = require('http');

// Port binding and health check server for cloud providers (Koyeb, Render, etc.)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🤖 Discord Bot is active and running 24/7!');
}).listen(PORT, () => {
  console.log(`📡 Listening on port: ${PORT} (Cloud server compatibility active)`);
});

const { Client, GatewayIntentBits, ActivityType, Collection, EmbedBuilder } = require('discord.js');
const db = require('./services/db');
const youtubeService = require('./services/youtube');

// Create Discord Client
// Guilds intent is enough for slash commands and managing voice/text channels.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// Collect commands (Total 12 commands)
const commandsList = [
  ...require('./commands/youtube'),
  ...require('./commands/general')
];

client.commands = new Collection();
for (const cmd of commandsList) {
  client.commands.set(cmd.data.name, cmd);
}

// When bot is ready
client.once('ready', async () => {
  console.log(`🤖 Bot successfully logged in as: ${client.user.tag}`);
  
  // Set playing status to '/help'
  client.user.setActivity('/help', { type: ActivityType.Playing });
  
  // Register slash commands to Discord globally and locally (guilds)
  try {
    console.log('Registering slash commands to Discord API...');
    await client.application?.commands.set(commandsList.map(c => c.data.toJSON()));
    
    // Fill guild cache and register commands for each guild
    await client.guilds.fetch(); // fill cache
    for (const guild of client.guilds.cache.values()) {
      try {
        await guild.commands.set(commandsList.map(c => c.data.toJSON()));
      } catch (err) {
        console.warn(`Could not register local commands for Guild (${guild.id}):`, err.message);
      }
    }
    console.log('✅ All slash commands have been registered successfully!');
  } catch (error) {
    console.error('❌ Error occurred while registering slash commands:', error);
  }

  // Start background timers (YouTube Video & Subscriber Checking)
  startBackgroundTasks();
});

// Listen to Slash Command Interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // Channel Restriction Check (the /command-channel command can be used in any channel)
  if (interaction.commandName !== 'command-channel') {
    const guildConfig = db.getGuildData(interaction.guildId);
    if (guildConfig.botChannelId && interaction.channelId !== guildConfig.botChannelId) {
      return interaction.reply({
        content: `❌ You can only use the commands of this bot in the <#${guildConfig.botChannelId}> channel!`,
        ephemeral: true
      });
    }
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command execution error (${interaction.commandName}):`, error);
    const errorMsg = '❌ An error occurred while executing this command!';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
    }
  }
});

/**
 * Background Tasks (YouTube Video Checking and Live Subscriber Counter)
 */
function startBackgroundTasks() {
  console.log('⏰ Background tasks started.');

  // YouTube Video and Subscriber Check (Every 8 minutes)
  // 8 minutes is ideal due to Discord's channel name change limit (twice per 10 mins).
  setInterval(async () => {
    console.log('🔄 Checking for new YouTube videos and updating subscriber counters...');
    const data = db.readDb();
    
    for (const [guildId, guildConfig] of Object.entries(data.guilds)) {
      if (!guildConfig.youtubeChannelId) continue;
      
      try {
        // A. New Video Check
        if (guildConfig.notifyChannelId) {
          const latestVideo = await youtubeService.getLatestVideo(guildConfig.youtubeChannelId);
          if (latestVideo) {
            const videoId = latestVideo.snippet.resourceId.videoId;
            
            // If a new video is detected, announce it
            if (videoId && videoId !== guildConfig.lastVideoId) {
              const channel = await client.channels.fetch(guildConfig.notifyChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const { title, thumbnails } = latestVideo.snippet;
                const embed = new EmbedBuilder()
                  .setTitle(`🔔 NEW VIDEO IS LIVE!`)
                  .setDescription(`**${latestVideo.snippet.channelTitle}** uploaded a new video:\n\n🎥 **${title}**`)
                  .setURL(`https://youtu.be/${videoId}`)
                  .setImage(thumbnails?.high?.url || thumbnails?.medium?.url)
                  .setColor('#FF0000')
                  .setTimestamp();
                  
                await channel.send({ content: `@everyone New video is live! 🚀 https://youtu.be/${videoId}`, embeds: [embed] });
                
                // Update the last video ID
                db.updateGuildData(guildId, { lastVideoId: videoId });
              }
            }
          }
        }
        
        // B. Live Subscriber Counter Update
        if (guildConfig.subscriberCounterChannelId) {
          const channelDetails = await youtubeService.getChannelDetails(guildConfig.youtubeChannelId);
          if (channelDetails) {
            const subCount = parseInt(channelDetails.statistics.subscriberCount);
            const channel = await client.channels.fetch(guildConfig.subscriberCounterChannelId).catch(() => null);
            
            if (channel) {
              const currentName = channel.name;
              const expectedName = `👥 Subs: ${subCount.toLocaleString('en-US')}`;
              
              // Only update if the name is different (prevents unnecessary Discord API calls)
              if (currentName !== expectedName) {
                await channel.setName(expectedName).catch(err => {
                  console.error(`Could not update channel name (${guildId}):`, err.message);
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`YouTube automatic check error (Guild: ${guildId}):`, error.message);
      }
    }
  }, 8 * 60 * 1000);
}

// Start the bot
client.login(process.env.DISCORD_TOKEN);
