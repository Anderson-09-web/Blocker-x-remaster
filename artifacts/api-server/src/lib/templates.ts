export const PYTHON_MAIN = `import discord
from discord.ext import commands
import os
import time

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"Bot en linea: {bot.user}")

@bot.command()
async def ping(ctx):
    # Medimos el round-trip real de la llamada a la API de Discord en vez de
    # depender solo de bot.latency (latencia del heartbeat), que puede reportar
    # valores absurdos si el heartbeat se retrasa o el bot acaba de conectar.
    start = time.perf_counter()
    msg = await ctx.send("Pong...")
    rtt_ms = round((time.perf_counter() - start) * 1000)
    await msg.edit(content=f"Pong! {rtt_ms}ms")

bot.run(os.getenv("DISCORD_TOKEN"))
`;

export const PYTHON_REQUIREMENTS = `discord.py>=2.3.2
requests>=2.31.0
aiohttp>=3.9.0
`;

export const JS_MAIN = `const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", (c) => {
  console.log(\`Logged in as \${c.user.tag}\`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content === "!ping") {
    // Medimos el round-trip real de la llamada a la API de Discord en vez de
    // depender solo de client.ws.ping (latencia del heartbeat), que puede
    // reportar valores absurdos si el heartbeat se retrasa o el bot acaba de conectar.
    const start = Date.now();
    const sent = await message.reply("Pong...");
    const rttMs = Date.now() - start;
    await sent.edit(\`Pong! \${rttMs}ms\`);
  }
});

client.login(process.env.DISCORD_TOKEN);
`;

export const JS_PACKAGE_JSON = `{
  "name": "discord-bot",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "dotenv": "^16.3.1"
  }
}
`;
