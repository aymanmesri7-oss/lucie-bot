const {
  Client, GatewayIntentBits, PermissionFlagsBits,
  EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, PermissionsBitField
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const pendingMessages = new Map();

// === CONFIG ===
const RECRUTEUR_CATEGORY_ID = '1559921478370074685';
const RECRUTEUR_ROLE_ID = '1559946050691670036';

client.once('ready', () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {

  // ==================
  // /send → popup
  // ==================
  if (interaction.isChatInputCommand() && interaction.commandName === 'send') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('salon');
    const couleur = interaction.options.getString('couleur') || '#2ecc71';
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

    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
    await interaction.showModal(modal);
  }

  // ==================
  // /send popup soumis
  // ==================
  if (interaction.isModalSubmit() && interaction.customId === 'send_modal') {
    const pending = pendingMessages.get(interaction.user.id);
    if (!pending) return interaction.reply({ content: '❌ Erreur, réessaie /send', ephemeral: true });

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

  // ==================
  // /recruteur → message avec bouton
  // ==================
  if (interaction.isChatInputCommand() && interaction.commandName === 'recruteur') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setDescription(
        '🎯 **Deviens recruteur !**\n\n' +
        'Tu veux **gagner de l\'argent** en ramenant des VA ?\n\n' +
        '💰 **0,50$** par VA ramené · **+2$** si ton VA est bon (s\'il produit)\n' +
        'Aucun plafond — plus t\'en ramènes, plus tu gagnes.\n\n' +
        '👇 Clique pour commencer !'
      )
      .setColor('#f1c40f');

    const button = new ButtonBuilder()
      .setCustomId('devenir_recruteur')
      .setLabel('🚀 Devenir recruteur')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Message recruteur posté !', ephemeral: true });
  }

  // ==================
  // Bouton "Devenir recruteur" cliqué
  // ==================
  if (interaction.isButton() && interaction.customId === 'devenir_recruteur') {
    const member = interaction.member;
    const guild = interaction.guild;

    // Vérifier s'il a déjà le rôle
    if (member.roles.cache.has(RECRUTEUR_ROLE_ID)) {
      return interaction.reply({ content: '⚠️ Tu es déjà recruteur !', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Donner le rôle
      await member.roles.add(RECRUTEUR_ROLE_ID);

      // 2. Créer le salon perso
      const channelName = `🎯-${member.user.username}`;
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: RECRUTEUR_CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ]
          }
        ]
      });

      // 3. Message de bienvenue dans le salon perso
      const welcomeEmbed = new EmbedBuilder()
        .setDescription(
          `👋 **Bienvenue ${member} !**\n\n` +
          `Tu es maintenant **recruteur** 🎯\n\n` +
          `Ton job : **ramener des VA via Telegram**\n\n` +
          `💰 **0,50$** par VA ramené · **+2$** si ton VA est bon\n` +
          `Aucun plafond — plus t\'en ramènes, plus tu gagnes.\n\n` +
          `❓ Un souci ? **Écris directement ici** — un manager te répond.`
        )
        .setColor('#2ecc71');

      await newChannel.send({ embeds: [welcomeEmbed] });

      await interaction.editReply({ content: `✅ T'es recruteur ! Ton salon perso : ${newChannel}` });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '❌ Erreur, contacte un admin.' });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
