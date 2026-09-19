import os
import sys
import discord
from discord.ext import commands
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 1. Tải token từ file .env
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path, encoding='utf-8-sig')
TOKEN = os.getenv('DISCORD_TOKEN')

if not TOKEN and os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8-sig') as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            if key.strip() == 'DISCORD_TOKEN':
                TOKEN = value.strip().strip('"').strip("'")
                break

if not TOKEN:
    raise SystemExit('DISCORD_TOKEN chua duoc cau hinh trong mng discord/.env')

# 2. Thiết lập quyền hạn
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

def make_embed(text):
    return discord.Embed(description=text, color=0x2b90ff)

@bot.event
async def on_ready():
    print(f'Bot da ket noi thanh cong: {bot.user}')

# --- CHÀO MỪNG THÀNH VIÊN MỚI ---

@bot.event
async def on_member_join(member):
    # Tìm kênh có tên là 'lgbt'
    channel = discord.utils.get(member.guild.text_channels, name="lgbt")
    if channel:
        await channel.send(embed=make_embed(f"Chào mừng bae {member.mention} đã đến với ngôi nhà yêu thương =))."))

# --- LỆNH QUẢN TRỊ (Chỉ Top.server mới dùng được) ---

@bot.command()
@commands.has_role("Top.server")
async def addrole(ctx, member: discord.Member, role: discord.Role):
    await member.add_roles(role)
    await ctx.send(embed=make_embed(f"Đã vứt **{role.name}** vào mặt **{member.display_name}**."))

@bot.command()
@commands.has_role("Top.server")
async def kick(ctx, member: discord.Member, *, reason=None):
    await member.kick(reason=reason)
    await ctx.send(embed=make_embed(f" cook **{member.display_name}**. Lý do: {reason or 'ngoo'}"))

@bot.command()
@commands.has_role("Top.server")
async def mute(ctx, member: discord.Member):
    role_muted = discord.utils.get(ctx.guild.roles, name="Muted")
    if not role_muted:
        await ctx.send(embed=make_embed("Chịu, không thấy role Muted đâu."))
        return

    # Xóa sạch các vai trò cũ (trừ @everyone) và thêm role Muted
    roles_to_remove = [r for r in member.roles if r != ctx.guild.default_role]
    if roles_to_remove:
        await member.remove_roles(*roles_to_remove)
    
    await member.add_roles(role_muted)
    await ctx.send(embed=make_embed(f" Lè Nhè **{member.display_name}** (Nín)."))

# test case
@bot.command()
async def ping(ctx):
    await ctx.send(embed=make_embed(f"Pong! {round(bot.latency*1000)}ms"))

# --- XỬ LÝ LỖI ---

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRole):
        await ctx.send(embed=make_embed("Tuổi l đòi dùng?"))
    elif isinstance(error, commands.MissingPermissions):
        await ctx.send(embed=make_embed("Ngáo quyền lực?"))
    else:
        print(f"Lỗi: {error}")

bot.run(TOKEN)