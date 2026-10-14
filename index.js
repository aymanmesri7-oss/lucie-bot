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
const EXPLICATION_CHANNEL_ID = '1559920724548784128';
const ANNONCES_CHANNEL_ID = '1559920914873851924';
const GROUPES_CHANNEL_ID = '1559921185763106876';

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

  // /send popup soumis
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
  // ÉTAPE 1 — Bouton "Devenir recruteur" cliqué
  // ==================
  if (interaction.isButton() && interaction.customId === 'devenir_recruteur') {
    const member = interaction.member;
    const guild = interaction.guild;

    if (member.roles.cache.has(RECRUTEUR_ROLE_ID)) {
      return interaction.reply({ content: '⚠️ Tu es déjà recruteur !', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await member.roles.add(RECRUTEUR_ROLE_ID);

      const channelName = `🎯-${member.user.username}`;
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: RECRUTEUR_CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      // Message étape 1
      const embed1 = new EmbedBuilder()
        .setDescription(
          `👋 **Bienvenue ${member} !**\n\n` +
          `Tu es maintenant **recruteur** 🎯\n\n` +
          `Ton job : **ramener des VA via Telegram**\n\n` +
          `💰 **0,50$** par VA ramené · **+2$** si ton VA est bon\n` +
          `Aucun plafond — plus t'en ramènes, plus tu gagnes.`
        )
        .setColor('#2ecc71');

      const btn1 = new ButtonBuilder()
        .setCustomId('recru_step2')
        .setLabel('C\'est parti ✅')
        .setStyle(ButtonStyle.Success);

      await newChannel.send({ embeds: [embed1], components: [new ActionRowBuilder().addComponents(btn1)] });
      await interaction.editReply({ content: `✅ T'es recruteur ! Ton salon perso : ${newChannel}` });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '❌ Erreur, contacte un admin.' });
    }
  }

  // ==================
  // ÉTAPE 2 — "C'est parti" → Prépare ton Telegram
  // ==================
  if (interaction.isButton() && interaction.customId === 'recru_step2') {
    const embed2 = new EmbedBuilder()
      .setDescription(
        `📱 **Prépare ton Telegram**\n\n` +
        `Il te faut un **compte Telegram propre** pour poster les annonces.\n\n` +
        `❓ Un souci ? **Écris directement ici** — un manager te répond.\n\n` +
        `Quand c'est bon 👇`
      )
      .setColor('#3498db');

    const btn2 = new ButtonBuilder()
      .setCustomId('recru_step3')
      .setLabel('Mon Telegram est prêt ✅')
      .setStyle(ButtonStyle.Success);

    await interaction.update({ components: [] }); // retire le bouton précédent
    await interaction.channel.send({ embeds: [embed2], components: [new ActionRowBuilder().addComponents(btn2)] });
  }

  // ==================
  // ÉTAPE 3 — "Telegram prêt" → Envoie ton @
  // ==================
  if (interaction.isButton() && interaction.customId === 'recru_step3') {
    const embed3 = new EmbedBuilder()
      .setDescription(
        `📩 **Envoie ton @Telegram**\n\n` +
        `Dernière étape : envoie ton **@pseudo Telegram** — c'est comme ça qu'on te suit.\n\n` +
        `⚠️ Tu es **bloqué** tant que tu l'as pas envoyé.`
      )
      .setColor('#e67e22');

    const btn3 = new ButtonBuilder()
      .setCustomId('recru_send_telegram')
      .setLabel('📩 Envoyer mon @Telegram')
      .setStyle(ButtonStyle.Success);

    await interaction.update({ components: [] });
    await interaction.channel.send({ embeds: [embed3], components: [new ActionRowBuilder().addComponents(btn3)] });
  }

  // ==================
  // ÉTAPE 3b — Popup pour envoyer le @Telegram
  // ==================
  if (interaction.isButton() && interaction.customId === 'recru_send_telegram') {
    const modal = new ModalBuilder()
      .setCustomId('telegram_modal')
      .setTitle('Ton @Telegram');

    const input = new TextInputBuilder()
      .setCustomId('telegram_pseudo')
      .setLabel('Ton @pseudo Telegram')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('@monpseudo')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  // ==================
  // ÉTAPE 4 — Telegram reçu → message final
  // ==================
  if (interaction.isModalSubmit() && interaction.customId === 'telegram_modal') {
    const pseudo = interaction.fields.getTextInputValue('telegram_pseudo');

    // Confirmer le pseudo reçu
    const confirmEmbed = new EmbedBuilder()
      .setDescription(`✅ Telegram enregistré : **${pseudo}**`)
      .setColor('#2ecc71');

    await interaction.reply({ embeds: [confirmEmbed] });

    // Message final avec toutes les étapes
    const finalEmbed = new EmbedBuilder()
      .setDescription(
        `🎉 **T'es enregistré comme recruteur !**\n\n` +
        `Voici **TOUT** pour commencer — dans l'ordre :\n\n` +
        `1️⃣ **Regarde la vidéo** → <#${EXPLICATION_CHANNEL_ID}>\n` +
        `2️⃣ **Copie ton annonce** → <#${ANNONCES_CHANNEL_ID}>\n` +
        `3️⃣ **Poste-la** dans les groupes → <#${GROUPES_CHANNEL_ID}> (Facebook + Telegram)\n` +
        `4️⃣ Dis à chaque VA de mettre **ton nom** dans <#${interaction.guild.channels.cache.find(c => c.name.includes('qui-t-a-invit'))?.id || 'qui-t-a-invité'}>\n\n` +
        `💰 Chaque VA ramené = **0,50$** (+2$ s'il produit) · aucun plafond\n\n` +
        `**Ramène du monde, encaisse. Let's go 🔥**`
      )
      .setColor('#f1c40f');

    await interaction.channel.send({ embeds: [finalEmbed] });
  }

});

client.login(process.env.DISCORD_TOKEN);
