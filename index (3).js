const {
  Client, GatewayIntentBits, PermissionFlagsBits,
  EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder,
  ChannelType, StringSelectMenuBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Stocker le salon choisi temporairement
const pendingMessages = new Map();

client.once('ready', () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {

  // Commande /send → ouvre le popup
  if (interaction.isChatInputCommand() && interaction.commandName === 'send') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('salon');
    const couleur = interaction.options.getString('couleur') || '#2ecc71';

    // Stocker le salon et la couleur pour après le popup
    pendingMessages.set(interaction.user.id, { channelId: channel.id, couleur });

    const modal = new ModalBuilder()
      .setCustomId('send_modal')
      .setTitle('Envoyer un message');

    const messageInput = new TextInputBuilder()
      .setCustomId('message_content')
      .setLabel('Ton message (gras = **texte**, emoji OK)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('🚀 **On recrute !**\n\nOn cherche des VA...')
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // Quand le popup est soumis
  if (interaction.isModalSubmit() && interaction.customId === 'send_modal') {
    const pending = pendingMessages.get(interaction.user.id);
    if (!pending) {
      return interaction.reply({ content: '❌ Erreur, réessaie /send', ephemeral: true });
    }

    const message = interaction.fields.getTextInputValue('message_content');
    const channel = interaction.guild.channels.cache.get(pending.channelId);

    if (!channel) {
      pendingMessages.delete(interaction.user.id);
      return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setDescription(message)
      .setColor(pending.couleur);

    try {
      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: `✅ Message envoyé dans ${channel}`, ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: `❌ Erreur : impossible d'envoyer dans ${channel}`, ephemeral: true });
    }

    pendingMessages.delete(interaction.user.id);
  }
});

client.login(process.env.DISCORD_TOKEN);
