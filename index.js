const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

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
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('salon');
    const couleur = interaction.options.getString('couleur') || '#2ecc71';

    const embed = new EmbedBuilder()
      .setDescription(message)
      .setColor(couleur)
      .setFooter({ text: 'Kyce Agency' });

    try {
      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: `✅ Message envoyé dans ${channel}`, ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: `❌ Erreur : impossible d'envoyer dans ${channel}`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
