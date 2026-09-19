const path = require("path");
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { QuickDB } = require("quick.db");

// Khởi tạo DB và Client
const db = new QuickDB({ filePath: path.resolve(__dirname, '../data/database.sqlite') });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const DICE_ICONS = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅'
};

function makeEmbed(content) {
    return new EmbedBuilder()
        .setColor(0x2b90ff)
        .setDescription(content)
        .setFooter({ text: 'Fishfarm random' });
}

function makeCmdEmbed() {
    return new EmbedBuilder()
        .setColor(0x2b90ff)
        .setTitle('Lenh hien co')
        .setDescription('Su dung lenh duoi day de bat dau choi.')
        .addFields(
            { name: 'Lenh', value: '`/choi-ca`', inline: true },
            { name: 'Loai ca', value: 'Ca be hoac ca lon', inline: true },
            { name: 'So luong', value: 'Nhap so ca muon dat cuoc', inline: true }
        )
        .setFooter({ text: 'Tin nhan public' });
}

function diceIcon(value) {
    return DICE_ICONS[value] || 'thay vao';
}

function choiceLabel(choice) {
    return choice === 'ca-be' ? 'Ca be' : 'Ca lon';
}

async function playGame(interaction, luaChon, soCa, ephemeral = false) {
    if (soCa <= 0) return interaction.reply({ embeds: [makeEmbed('❌ Số cá cược phải lớn hơn 0!')], ephemeral });

    const userId = interaction.user.id;
    const balance = await db.get(`balance_${userId}`) || 0;
    if (balance < soCa) return interaction.reply({ embeds: [makeEmbed('❌ Bạn không đủ cá để cược!')], ephemeral });

    const xucXac1 = Math.floor(Math.random() * 6) + 1;
    const xucXac2 = Math.floor(Math.random() * 6) + 1;
    const xucXac3 = Math.floor(Math.random() * 6) + 1;
    const tong = xucXac1 + xucXac2 + xucXac3;
    const ketQua = tong <= 10 ? 'ca-be' : 'ca-lon';

    await interaction.reply({ embeds: [makeEmbed('🎲 Bat dau tung xuc xac...')], ephemeral });
    await wait(900);
    const resultText = [
        `🎲 Xuc xac 1: ${diceIcon(xucXac1)}`,
        `🎲 Xuc xac 2: ${diceIcon(xucXac2)}`,
        `🎲 Xuc xac 3: ${diceIcon(xucXac3)}`,
        `🎯 Tong 3 xuc xac: **${tong}** (${choiceLabel(ketQua)})`
    ].join('\n');

    if (luaChon === ketQua) {
        await db.add(`balance_${userId}`, soCa);
        await interaction.editReply({
            embeds: [makeEmbed(`${resultText}\n\n🎉 **Thang!** Ban nhan them **${soCa}** ca!`)]
        });
    } else {
        await db.sub(`balance_${userId}`, soCa);
        await interaction.editReply({
            embeds: [makeEmbed(`${resultText}\n\n😢 **Thua!** Ban mat **${soCa}** ca.`)]
        });
    }
}

// 1. Định nghĩa lệnh
const cmdCommand = new SlashCommandBuilder()
    .setName('cmd')
    .setDescription('Hien thi lenh de bam');

const gameCommand = new SlashCommandBuilder()
    .setName('choi-ca')
    .setDescription('Cá bé (1-10) hoặc Cá lớn (11-18)')
    .addStringOption(opt => opt.setName('loai-ca')
        .setDescription('Chọn loại cá')
        .setRequired(true)
        .addChoices({name: 'Cá bé', value: 'ca-be'}, {name: 'Cá lớn', value: 'ca-lon'}))
    .addIntegerOption(opt => opt.setName('so-luong')
        .setDescription('Số cá đặt cược')
        .setRequired(true));

const commands = [cmdCommand, gameCommand].map(cmd => cmd.toJSON());

// 2. Đăng ký lệnh lên Discord (Chạy 1 lần khi khởi động)
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands
        });
        console.log('✅ Đã đăng ký lệnh /cmd va /choi-ca thành công!');
    } catch (error) {
        console.error('❌ Lỗi đăng ký lệnh:', error);
    }
});

// 3. Logic xử lý game
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'cmd') {
            return interaction.reply({
                embeds: [makeCmdEmbed()],
                ephemeral: false
            });
        }

        if (interaction.commandName === 'choi-ca') {
            const luaChon = interaction.options.getString('loai-ca');
            const soCa = interaction.options.getInteger('so-luong');
            return playGame(interaction, luaChon, soCa, false);
        }
    }
});

// 4. Đăng nhập bot
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ LỖI ĐĂNG NHẬP: Token không hợp lệ. Hãy kiểm tra lại file .env!");
});