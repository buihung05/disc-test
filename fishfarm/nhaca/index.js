const path = require("path");
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QuickDB } = require("quick.db");

const db = new QuickDB({ filePath: path.resolve(__dirname, '../data/database.sqlite') });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const adminUserIds = new Set(['916502902011473940']);

function makeEmbed(content, options = {}) {
    return {
        ...options,
        embeds: [new EmbedBuilder().setColor(0x2b90ff).setDescription(content)]
    };
}

function makeCmdEmbed() {
    return new EmbedBuilder()
        .setColor(0x2b90ff)
        .setTitle('Lenh hien co')
        .setDescription('Danh sach lenh ban co the bam.')
        .addFields(
            { name: 'Lenh', value: '`/diem-danh`', inline: true },
            { name: 'Lenh', value: '`/so-du`', inline: true }
        );
}

const commands = [
    new SlashCommandBuilder().setName('cmd').setDescription('Hien thi lenh de bam'),
    new SlashCommandBuilder().setName('diem-danh').setDescription('Điểm danh nhận 5.000.000 cá'),
    new SlashCommandBuilder().setName('so-du').setDescription('Kiểm tra số dư cá'),
    new SlashCommandBuilder()
        .setName('quan-ly-ca')
        .setDescription('Quản lý cá cho thành viên')
        .addSubcommand(subcommand => subcommand
            .setName('them')
            .setDescription('Thêm cá cho thành viên')
            .addUserOption(option => option.setName('thanh-vien').setDescription('Thành viên cần thêm cá').setRequired(true))
            .addIntegerOption(option => option.setName('so-ca').setDescription('Số cá cần thêm').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('sua')
            .setDescription('Sửa số cá của thành viên')
            .addUserOption(option => option.setName('thanh-vien').setDescription('Thành viên cần sửa cá').setRequired(true))
            .addIntegerOption(option => option.setName('so-ca').setDescription('Số cá mới').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('xoa')
            .setDescription('Xóa bớt cá của thành viên')
            .addUserOption(option => option.setName('thanh-vien').setDescription('Thành viên cần xóa cá').setRequired(true))
            .addIntegerOption(option => option.setName('so-ca').setDescription('Số cá cần xóa').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('xem')
            .setDescription('Xem số dư cá của thành viên')
            .addUserOption(option => option.setName('thanh-vien').setDescription('Thành viên cần xem').setRequired(true)))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

function isAdmin(interaction) {
    return adminUserIds.has(interaction.user.id);
}

client.once('clientReady', async () => {
    console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Đã đăng ký lệnh nhaca thành công!');
    } catch (error) {
        console.error('❌ Lỗi đăng ký lệnh nhaca:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    const today = new Date().toISOString().split('T')[0];

    if (interaction.commandName === 'cmd') {
        return interaction.reply({
            embeds: [makeCmdEmbed()],
            ephemeral: true
        });
    }

    if (interaction.commandName === 'diem-danh') {
        const lastCheck = await db.get(`lastCheck_${userId}`);
        if (lastCheck === today) return interaction.reply(makeEmbed("❌ Bạn đã điểm danh hôm nay rồi!"));

        await db.add(`balance_${userId}`, 5000000);
        await db.set(`lastCheck_${userId}`, today);
        return interaction.reply(makeEmbed("✅ Điểm danh thành công! Bạn nhận được 5.000.000 cá."));
    }

    if (interaction.commandName === 'so-du') {
        const balance = await db.get(`balance_${userId}`) || 0;
        return interaction.reply(makeEmbed(`💰 Số dư của bạn: **${balance.toLocaleString()} cá**.`));
    }

    if (interaction.commandName === 'quan-ly-ca') {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Bạn không có quyền dùng lệnh này.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const member = interaction.options.getUser('thanh-vien', true);
        const amount = interaction.options.getInteger('so-ca');
        const key = `balance_${member.id}`;
        const currentBalance = await db.get(key) || 0;

        if (subcommand === 'them') {
            if (amount <= 0) return interaction.reply(makeEmbed('❌ Số cá cần thêm phải lớn hơn 0.', { ephemeral: true }));

            const newBalance = currentBalance + amount;
            await db.set(key, newBalance);
            return interaction.reply(makeEmbed(`✅ Đã thêm **${amount.toLocaleString()} cá** cho <@${member.id}>. Số dư mới: **${newBalance.toLocaleString()} cá**.`));
        }

        if (subcommand === 'sua') {
            if (amount < 0) return interaction.reply(makeEmbed('❌ Số cá mới không được nhỏ hơn 0.', { ephemeral: true }));

            await db.set(key, amount);
            return interaction.reply(makeEmbed(`✅ Đã sửa số cá của <@${member.id}> thành **${amount.toLocaleString()} cá**.`));
        }

        if (subcommand === 'xoa') {
            if (amount <= 0) return interaction.reply(makeEmbed('❌ Số cá cần xóa phải lớn hơn 0.', { ephemeral: true }));

            const removedAmount = Math.min(amount, currentBalance);
            const newBalance = Math.max(currentBalance - amount, 0);
            await db.set(key, newBalance);
            return interaction.reply(makeEmbed(`✅ Đã xóa **${removedAmount.toLocaleString()} cá** của <@${member.id}>. Số dư còn lại: **${newBalance.toLocaleString()} cá**.`));
        }

        if (subcommand === 'xem') {
            return interaction.reply(makeEmbed(`💰 Số dư của <@${member.id}>: **${currentBalance.toLocaleString()} cá**.`));
        }
    }
});

client.login(process.env.DISCORD_TOKEN).catch(() => {
    console.error('❌ Lỗi đăng nhập bot nhaca. Kiểm tra lại DISCORD_TOKEN trong nhaca/.env');
});