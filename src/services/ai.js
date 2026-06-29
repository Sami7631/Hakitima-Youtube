const axios = require('axios');
const db = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

const ANTHROPIC_MODELS = [
  'claude-3-5-sonnet-20240620',
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229'
];

/**
 * Sunucu ayarlarına göre yapay zekadan yanıt üretir.
 * @param {string} prompt Yapay zekaya gönderilecek talimat/metin
 * @param {string} guildId Sunucu ID'si
 * @returns {Promise<string>} AI yanıtı
 */
async function generateText(prompt, guildId) {
  const guildConfig = db.getGuildData(guildId);
  
  let provider = guildConfig.aiProvider || 'gemini';
  let apiKey = guildConfig.aiApiKey;
  
  if (!apiKey) {
    apiKey = process.env.GEMINI_API_KEY || process.env.YOUTUBE_API_KEY;
    provider = 'gemini';
  }
  
  if (!apiKey) {
    throw new Error('Yapay zeka API anahtarı bulunamadı. Lütfen `/ai-ayarlar` komutu ile sunucunuza özel bir API anahtarı tanımlayın.');
  }

  return generateWithFallback(prompt, provider, apiKey);
}

/**
 * Sağlayıcıya göre model listesinde sırayla dener
 */
async function generateWithFallback(prompt, provider, apiKey) {
  if (provider === 'gemini') {
    let lastError = null;
    let errorsList = [];
    
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`Gemini ${model} deneniyor...`);
        const result = await callGemini(prompt, model, apiKey);
        return result;
      } catch (error) {
        const errorMsg = error.message || String(error);
        console.warn(`Gemini ${model} başarısız oldu:`, errorMsg);
        lastError = error;
        errorsList.push(`${model}: ${errorMsg}`);
      }
    }
    
    // Eğer tümü başarısız olduysa ve hata "API key not valid" veya "NOT_FOUND" veya "PERMISSION_DENIED" ise kullanıcı dostu bir öneri ekle
    let customSuggestion = '';
    const errorStr = errorsList.join(' ');
    if (errorStr.includes('API key') || errorStr.includes('not enabled') || errorStr.includes('disabled') || errorStr.includes('not found') || errorStr.includes('PERMISSION_DENIED') || errorStr.includes('blocked')) {
      customSuggestion = '\n\n💡 İPUCU: Girdiğiniz API anahtarı geçersiz veya yapay zeka servisi için yetkisi yok. Google AI Studio üzerinden yeni bir anahtar alıp `/ai-ayarlar gemini <yenikey>` yazarak bota tanımlayın.';
    }
    
    throw new Error(`Tüm Gemini modelleri başarısız oldu.${customSuggestion}\nSon Hata: ${lastError?.message || lastError}`);
  } else if (provider === 'anthropic') {
    let lastError = null;
    for (const model of ANTHROPIC_MODELS) {
      try {
        console.log(`Anthropic ${model} modeli deneniyor...`);
        const result = await callAnthropic(prompt, model, apiKey);
        return result;
      } catch (error) {
        console.warn(`Anthropic ${model} başarısız oldu:`, error.message);
        lastError = error;
      }
    }
    throw new Error(`Tüm Anthropic modelleri başarısız oldu. Son Hata: ${lastError.message}`);
  } else {
    throw new Error('Bilinmeyen yapay zeka sağlayıcısı.');
  }
}

/**
 * Google Gemini API çağrısı
 */
async function callGemini(prompt, modelName, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

/**
 * Anthropic (Claude) API çağrısı
 */
async function callAnthropic(prompt, model, apiKey) {
  const url = 'https://api.anthropic.com/v1/messages';
  
  try {
    const response = await axios.post(url, {
      model: model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.data?.content?.[0]?.text) {
      return response.data.content[0].text;
    }
    throw new Error('Anthropic API boş yanıt döndürdü.');
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    throw new Error(errMsg);
  }
}

/**
 * Bir API anahtarını test eder
 */
async function testApiKey(provider, apiKey) {
  const testPrompt = 'Merhaba, bu bir test mesajıdır. Lütfen sadece "OK" yanıtını ver.';
  try {
    const response = await generateWithFallback(testPrompt, provider, apiKey);
    return !!response;
  } catch (error) {
    throw new Error(error.message);
  }
}

module.exports = {
  generateText,
  testApiKey
};
