const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'send') {
    // Vérifier que c'est un admin / modérateur
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('salon');

    try {
      await channel.send(message);
      await interaction.reply({ content: `✅ Message envoyé dans ${channel}`, ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: `❌ Erreur : impossible d'envoyer dans ${channel}`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
