const { google } = require('googleapis');

// YouTube API istemcisini başlat
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

/**
 * Kullanıcı girdisini (Kanal ID, @Kullanıcıadı veya link) Kanal ID'sine çözümler
 * @param {string} input 
 * @returns {Promise<string|null>} Channel ID
 */
async function resolveChannelId(input) {
  if (!input) return null;
  
  const cleanInput = input.trim();
  
  // 1. Doğrudan Kanal ID'si ise (UC ile başlar ve 24 karakterdir)
  if (cleanInput.startsWith('UC') && cleanInput.length === 24) {
    return cleanInput;
  }
  
  // 2. YouTube URL'si ise içinden Kanal ID veya @handle çekmeye çalış
  const channelIdMatch = cleanInput.match(/(?:youtube\.com\/(?:channel\/|c\/|user\/|@))([^\/\?#]+)/i);
  let identifier = channelIdMatch ? channelIdMatch[1] : cleanInput;
  
  // Eğer url'de @ varsa veya girdi @ ile başlıyorsa handle'dır
  if (identifier.startsWith('@')) {
    identifier = identifier.substring(1);
  }

  try {
    // Önce handle araması yap (YouTube API forHandle veya Search ile)
    const searchRes = await youtube.search.list({
      part: 'snippet',
      q: identifier,
      type: 'channel',
      maxResults: 1
    });
    
    if (searchRes.data.items && searchRes.data.items.length > 0) {
      return searchRes.data.items[0].id.channelId;
    }
  } catch (error) {
    console.error('ResolveChannelId hatası:', error.message);
  }
  
  return null;
}

/**
 * Kanal bilgilerini ve istatistiklerini getirir
 * @param {string} channelId 
 */
async function getChannelDetails(channelId) {
  try {
    const response = await youtube.channels.list({
      part: 'snippet,statistics,contentDetails',
      id: channelId
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }
    
    return response.data.items[0];
  } catch (error) {
    console.error('getChannelDetails hatası:', error.message);
    throw error;
  }
}

/**
 * Kanalın en son yüklediği videoyu getirir (Quota dostu yöntem)
 * @param {string} channelId 
 */
async function getLatestVideo(channelId) {
  try {
    // 1. Kanalın yükleme oynatma listesi ID'sini al
    const channelData = await getChannelDetails(channelId);
    if (!channelData) return null;
    
    const uploadsPlaylistId = channelData.contentDetails.relatedPlaylists.uploads;
    if (!uploadsPlaylistId) return null;
    
    // 2. Oynatma listesindeki en son videoyu çek
    const response = await youtube.playlistItems.list({
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: 1
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }
    
    return response.data.items[0];
  } catch (error) {
    console.error('getLatestVideo hatası:', error.message);
    return null;
  }
}

/**
 * YouTube'da video arar
 * @param {string} query 
 */
async function searchVideos(query) {
  try {
    const response = await youtube.search.list({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 1
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }
    
    return response.data.items[0];
  } catch (error) {
    console.error('searchVideos hatası:', error.message);
    return null;
  }
}

/**
 * Kanalın oynatma listelerini listeler
 * @param {string} channelId 
 */
async function getPlaylists(channelId) {
  try {
    const response = await youtube.playlists.list({
      part: 'snippet,contentDetails',
      channelId: channelId,
      maxResults: 5
    });
    
    return response.data.items || [];
  } catch (error) {
    console.error('getPlaylists hatası:', error.message);
    return [];
  }
}

/**
 * Kanalın en popüler 5 videosunu getirir
 * @param {string} channelId 
 */
async function getPopularVideos(channelId) {
  try {
    const response = await youtube.search.list({
      part: 'snippet',
      channelId: channelId,
      order: 'viewCount',
      type: 'video',
      maxResults: 5
    });
    
    return response.data.items || [];
  } catch (error) {
    console.error('getPopularVideos hatası:', error.message);
    return [];
  }
}

/**
 * Videonun en son yorumlarını getirir
 * @param {string} videoId 
 */
async function getVideoComments(videoId) {
  try {
    const response = await youtube.commentThreads.list({
      part: 'snippet',
      videoId: videoId,
      maxResults: 5,
      order: 'time'
    });
    
    return response.data.items || [];
  } catch (error) {
    console.error('getVideoComments hatası:', error.message);
    return [];
  }
}

/**
 * Videonun detaylarını (başlık, açıklama vb.) getirir
 * @param {string} videoId 
 */
async function getVideoDetails(videoId) {
  try {
    const response = await youtube.videos.list({
      part: 'snippet,statistics',
      id: videoId
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }
    
    return response.data.items[0];
  } catch (error) {
    console.error('getVideoDetails hatası:', error.message);
    return null;
  }
}

module.exports = {
  resolveChannelId,
  getChannelDetails,
  getLatestVideo,
  searchVideos,
  getPlaylists,
  getPopularVideos,
  getVideoComments,
  getVideoDetails
};
