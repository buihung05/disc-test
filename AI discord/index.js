require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const Groq = require('groq-sdk');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Lưu lịch sử chat đơn giản
const chatHistory = new Map();

const commands = [
  new SlashCommandBuilder().setName('cmd').setDescription('Hien thi cach su dung bot AI')
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

function makeEmbed(content) {
  return new EmbedBuilder().setColor(0x2b90ff).setDescription(content);
}

function makeCmdEmbed() {
  return new EmbedBuilder()
    .setColor(0x2b90ff)
    .setTitle('Lenh hien co')
    .setDescription('Cach dung bot AI')
    .addFields(
      { name: 'Lenh', value: '`/cmd`', inline: true },
      { name: 'Su dung', value: 'Mention bot roi nhap cau hoi, vi du: `@bot hoi ve...`', inline: false }
    );
}

client.once('clientReady', (c) => {
  console.log(`Bot đã kết nối với Groq và Discord: ${c.user.tag}`);
  rest.put(Routes.applicationCommands(c.user.id), { body: commands }).catch((error) => {
    console.error('Lỗi đăng ký lệnh AI:', error);
  });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'cmd') {
    return interaction.reply({ embeds: [makeCmdEmbed()], ephemeral: true });
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const userPrompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!userPrompt) return message.reply({ embeds: [makeEmbed('Chào bạn! Mình có thể giúp gì cho bạn?')] });

  // Lấy lịch sử chat
  if (!chatHistory.has(message.author.id)) {
    chatHistory.set(message.author.id, [
      { role: "system", content: "Bạn là trợ lý AI thông minh trên Discord. Trả lời ngắn gọn, bằng tiếng Việt." }
    ]);
  }

  const history = chatHistory.get(message.author.id);
  history.push({ role: "user", content: userPrompt });

  try {
    await message.channel.sendTyping();
    
    const chatCompletion = await groq.chat.completions.create({
      messages: history,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 1024
    });

    const reply = chatCompletion.choices[0]?.message?.content || "Mình không có câu trả lời.";
    
    // Lưu phản hồi vào lịch sử
    history.push({ role: "assistant", content: reply });
    
    // Gửi tin nhắn trả lời (nếu quá dài sẽ cắt)
    const chunks = reply.match(/.{1,1990}/gs) || [reply];
    for (const chunk of chunks) {
      await message.reply({ embeds: [makeEmbed(chunk)] });
    }
  } catch (error) {
    console.error("Lỗi Groq:", error);
    await message.reply({ embeds: [makeEmbed('❌ Đã có lỗi xảy ra khi kết nối với AI (Groq).')] });
  }
});

client.login(process.env.DISCORD_TOKEN);