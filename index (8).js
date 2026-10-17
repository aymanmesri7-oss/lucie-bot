const {
  Client, GatewayIntentBits, PermissionFlagsBits,
  EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, PermissionsBitField,
  UserSelectMenuBuilder
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// === VOCAL ===
const VOICE_CHANNEL_ID = '1559811076386983977';

const pendingMessages = new Map();

// === CONFIG SERVEUR RECRUTEMENT ===
const RECRUTEUR_CATEGORY_ID = '1559921478370074685';
const RECRUTEUR_ROLE_ID = '1559946050691670036';
const EXPLICATION_CHANNEL_ID = '1559920724548784128';
const ANNONCES_CHANNEL_ID = '1559920914873851924';
const GROUPES_CHANNEL_ID = '1559921185763106876';
const WELCOME_CHANNEL_ID = '1560216040649003069';

// === CONFIG SERVEUR RECRUTEMENT INSTAGRAM ===
const RECRU_INSTA_GUILD_ID = '1559811073291460619';
const RECRU_INSTA_CATEGORY_ID = '1560940278121103420';
const RECRU_INSTA_ROLE_ID = '1560941250956361839';

// Fonction pour récupérer les bons IDs selon le serveur
function getRecruteurConfig(guildId) {
  if (guildId === RECRU_INSTA_GUILD_ID) {
    return { categoryId: RECRU_INSTA_CATEGORY_ID, roleId: RECRU_INSTA_ROLE_ID };
  }
  return { categoryId: RECRUTEUR_CATEGORY_ID, roleId: RECRUTEUR_ROLE_ID };
}

// === CONFIG SERVEUR INSTA (salons perso auto) ===
const INSTA_GUILD_ID = '1559835788911583232';
const INSTA_PERSO_CATEGORY_ID = '1560635432197165086';
const INSTA_NOUVEAU_CHANNEL_ID = '1559835789850976308';
const INSTA_WELCOME_CHANNEL_ID = '1560356771166691428';
const INSTA_AFFILIATION_CHANNEL_ID = '1560641615121481810';
const INSTA_AUTO_ROLE_ID = '1560436154065616946';

// === TRACKING RECRUTEURS ===
const DATA_FILE = path.join(__dirname, 'recruteurs.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);

  // Rejoindre le vocal
  const voiceChannel = client.channels.cache.get(VOICE_CHANNEL_ID);
  if (voiceChannel) {
    const connection = joinVoiceChannel({
      channelId: VOICE_CHANNEL_ID,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      // Reconnecter automatiquement si déconnecté
      setTimeout(() => {
        joinVoiceChannel({
          channelId: VOICE_CHANNEL_ID,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: true
        });
      }, 5000);
    });

    console.log('Connecté au vocal !');
  }

  // Auto-créer les salons perso manquants sur le serveur Insta
  try {
    const instaGuild = await client.guilds.fetch(INSTA_GUILD_ID);
    if (instaGuild) {
      const members = await instaGuild.members.fetch();
      let count = 0;

      for (const [, member] of members) {
        if (member.user.bot) continue;

        const baseCategory = instaGuild.channels.cache.get(INSTA_PERSO_CATEGORY_ID);
        const baseName = baseCategory ? baseCategory.name : 'SALON PERSO';

        const existing = instaGuild.channels.cache.find(c => {
          if (!c.name.includes(member.user.username)) return false;
          const parent = instaGuild.channels.cache.get(c.parentId);
          return parent && (c.parentId === INSTA_PERSO_CATEGORY_ID || parent.name.startsWith(baseName));
        });

        if (!existing) {
          try {
            await createPersoChannel(member);
            count++;
            await new Promise(r => setTimeout(r, 1500));
          } catch (e) {
            console.error(`Erreur salon pour ${member.user.username}:`, e.message);
          }
        }
      }

      if (count > 0) console.log(`${count} salons perso créés automatiquement`);
    }
  } catch (e) {
    console.error('Erreur auto-setup:', e.message);
  }
});

// === FONCTION TROUVER OU CRÉER CATÉGORIE SALON PERSO ===
async function findOrCreateCategory(guild, baseCategoryId) {
  // Récupérer la catégorie de base
  const baseCategory = await guild.channels.fetch(baseCategoryId).catch(() => null);
  if (!baseCategory) return null;

  const baseName = baseCategory.name;

  // Trouver toutes les catégories "SALON PERSO", "SALON PERSO 2", etc.
  const allCategories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory && (c.id === baseCategoryId || c.name.startsWith(baseName)))
    .sort((a, b) => a.position - b.position);

  // Trouver une catégorie avec de la place (max 50 salons par catégorie)
  for (const [, cat] of allCategories) {
    const channelsInCat = guild.channels.cache.filter(c => c.parentId === cat.id);
    if (channelsInCat.size < 50) return cat;
  }

  // Toutes pleines → créer une nouvelle catégorie
  const num = allCategories.size + 1;
  const newCategory = await guild.channels.create({
    name: `${baseName} ${num}`,
    type: ChannelType.GuildCategory,
    position: baseCategory.position + allCategories.size
  });

  console.log(`Nouvelle catégorie créée : ${newCategory.name}`);
  return newCategory;
}

// === FONCTION CRÉER SALON PERSO INSTA ===
async function createPersoChannel(member) {
  const guild = member.guild;
  const channelName = `📸-${member.user.username}`;

  // Vérifier si le salon existe déjà (dans toutes les catégories salon perso)
  const baseCategory = await guild.channels.fetch(INSTA_PERSO_CATEGORY_ID).catch(() => null);
  const baseName = baseCategory ? baseCategory.name : 'SALON PERSO';

  const existing = guild.channels.cache.find(c => {
    if (!c.name.includes(member.user.username)) return false;
    const parent = guild.channels.cache.get(c.parentId);
    return parent && (c.parentId === INSTA_PERSO_CATEGORY_ID || parent.name.startsWith(baseName));
  });
  if (existing) return existing;

  // Trouver une catégorie avec de la place
  const category = await findOrCreateCategory(guild, INSTA_PERSO_CATEGORY_ID);
  if (!category) return null;

  const newChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: '977960166945325106', allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
    ]
  });

  // Message de bienvenue dans le salon perso
  const embed = new EmbedBuilder()
    .setDescription(
      `👋 **Salut ! Moi c'est Lucie, bienvenue** 🎉\n\n` +
      `Pour commencer, va dans <#${INSTA_NOUVEAU_CHANNEL_ID}> — tout est là-bas pour t'aider 👇\n\n` +
      `📩 **Envoie les liens de tes comptes ici** dans ton salon perso\n` +
      `🔗 **Viens réclamer ton lien ici** aussi\n` +
      `💬 On est là pour t'aider, hésite pas à écrire !`
    )
    .setColor('#2ecc71');

  await newChannel.send({ embeds: [embed] });
  return newChannel;
}

// === BIENVENUE ===
client.on('guildMemberAdd', async member => {
  try {
    // Serveur Recrutement — message de bienvenue
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      const embed = new EmbedBuilder()
        .setDescription(
          `👋 **Bienvenue ${member} !**\n\n` +
          `Moi c'est **Lucie**, contente de t'avoir parmi nous 🎉`
        )
        .setColor('#2ecc71')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

      await welcomeChannel.send({ embeds: [embed] });
    }

    // Serveur Insta — rôle auto + message bienvenue + créer salon perso
    if (member.guild.id === INSTA_GUILD_ID) {
      // Donner le rôle automatiquement
      try {
        await member.roles.add(INSTA_AUTO_ROLE_ID);
      } catch (e) {
        console.error('Erreur rôle auto:', e);
      }
      const instaWelcome = await member.guild.channels.fetch(INSTA_WELCOME_CHANNEL_ID);
      if (instaWelcome) {
        const instaEmbed = new EmbedBuilder()
          .setDescription(
            `👋 **Bienvenue ${member} !**\n\n` +
            `Moi c'est **Lucie**, contente de t'avoir parmi nous 🎉`
          )
          .setColor('#2ecc71')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        await instaWelcome.send({ embeds: [instaEmbed] });
      }

      await createPersoChannel(member);
      console.log(`Salon perso créé pour ${member.user.username}`);
    }

    console.log(`Bienvenue envoyé à ${member.user.username}`);
  } catch (error) {
    console.error('Erreur bienvenue:', error);
  }
});

client.on('interactionCreate', async interaction => {

  // ==================
  // /setup → créer salons perso pour tous les membres
  // ==================
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    if (interaction.guild.id !== INSTA_GUILD_ID) {
      return interaction.reply({ content: '❌ Cette commande marche que sur le serveur Insta.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const members = await interaction.guild.members.fetch();
    let count = 0;

    for (const [, member] of members) {
      if (member.user.bot) continue;

      const existing = interaction.guild.channels.cache.find(c =>
        c.name.includes(member.user.username) && c.parentId === INSTA_PERSO_CATEGORY_ID
      );

      if (!existing) {
        try {
          await createPersoChannel(member);
          count++;
          // Pause pour pas spam l'API Discord
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`Erreur salon pour ${member.user.username}:`, e);
        }
      }
    }

    await interaction.editReply({ content: `✅ ${count} salons perso créés !` });
  }

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
  // /invite → message "Qui t'a invité ?" avec bouton
  // ==================
  if (interaction.isChatInputCommand() && interaction.commandName === 'invite') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setDescription(
        '🤝 **Qui t\'a invité ?**\n\n' +
        'Bienvenue ! 👋\n\n' +
        'Si quelqu\'un t\'a fait venir ici, clique le bouton et **choisis son nom**.\n' +
        'Ça lui permet de toucher sa récompense 💰\n\n' +
        '👇 Clique pour indiquer qui t\'a invité !'
      )
      .setColor('#2ecc71');

    const button = new ButtonBuilder()
      .setCustomId('qui_invite')
      .setLabel('🤝 Indiquer qui m\'a invité')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);
    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Message posté !', ephemeral: true });
  }

  // ==================
  // Bouton "Qui t'a invité" → menu pour choisir la personne
  // ==================
  if (interaction.isButton() && interaction.customId === 'qui_invite') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('select_parrain')
      .setPlaceholder('Choisis la personne qui t\'a invité')
      .setMinValues(1)
      .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);
    await interaction.reply({
      content: '👇 **Choisis la personne qui t\'a invité :**',
      components: [row],
      ephemeral: true
    });
  }

  // ==================
  // Personne choisie → notifier le recruteur
  // ==================
  if (interaction.isUserSelectMenu() && interaction.customId === 'select_parrain') {
    const parrain = interaction.users.first();
    const va = interaction.user;
    const guild = interaction.guild;

    if (parrain.id === va.id) {
      return interaction.update({ content: '❌ Tu peux pas te choisir toi-même !', components: [] });
    }

    // Charger et mettre à jour les données
    const data = loadData();
    if (!data[parrain.id]) {
      data[parrain.id] = { count: 0, vas: [] };
    }

    // Vérifier si ce VA a déjà été compté
    if (data[parrain.id].vas.includes(va.id)) {
      return interaction.update({ content: '⚠️ Tu as déjà indiqué cette personne !', components: [] });
    }

    data[parrain.id].count += 1;
    data[parrain.id].vas.push(va.id);
    saveData(data);

    const count = data[parrain.id].count;
    const total = (count * 0.5).toFixed(2);

    // Confirmer au VA
    await interaction.update({
      content: `✅ **${parrain.displayName}** a été notifié ! Merci 🤝`,
      components: []
    });

    // Trouver le salon perso du parrain (sur tous les serveurs)
    const config = getRecruteurConfig(guild.id);
    const recruteurChannel = guild.channels.cache.find(c =>
      c.name.includes(parrain.user.username) &&
      (c.parentId === RECRUTEUR_CATEGORY_ID || c.parentId === INSTA_PERSO_CATEGORY_ID || c.parentId === RECRU_INSTA_CATEGORY_ID)
    );

    if (recruteurChannel) {
      const notifEmbed = new EmbedBuilder()
        .setDescription(
          `🎉 **${va} t'a désigné comme parrain !**\n\n` +
          `💰 **+0,50$** pour toi\n\n` +
          `📊 **Ton total :**\n` +
          `• VA ramenés : **${count}**\n` +
          `• Gains : **${total}$**`
        )
        .setColor('#2ecc71');

      await recruteurChannel.send({ embeds: [notifEmbed] });
      console.log(`Notif parrain envoyée à ${parrain.user.username}`);
    } else {
      console.log(`Salon perso de ${parrain.user.username} introuvable`);
    }

    // Message dans le salon affiliation (sur le même serveur)
    try {
      const affiliationChannel = guild.channels.cache.get(INSTA_AFFILIATION_CHANNEL_ID)
        || await guild.channels.fetch(INSTA_AFFILIATION_CHANNEL_ID).catch(() => null);

      if (!affiliationChannel) {
        // Chercher sur le serveur Insta directement
        const instaGuild = await client.guilds.fetch(INSTA_GUILD_ID).catch(() => null);
        if (instaGuild) {
          const ch = await instaGuild.channels.fetch(INSTA_AFFILIATION_CHANNEL_ID).catch(() => null);
          if (ch) {
            const gainParInvite = 0.10;
            const totalAffiliation = (count * gainParInvite).toFixed(2);
            const affiEmbed = new EmbedBuilder()
              .setDescription(
                `💰 **<@${parrain.id}>** a reçu **+0,10$** pour avoir invité **${va.username}** !\n\n` +
                `📊 **Total** : **${count}** VA invités · **${totalAffiliation}$** gagnés`
              )
              .setColor('#f1c40f');
            await ch.send({ embeds: [affiEmbed] });
            console.log('Message affiliation envoyé (via instaGuild)');
          }
        }
      } else {
        const gainParInvite = 0.10;
        const totalAffiliation = (count * gainParInvite).toFixed(2);
        const affiEmbed = new EmbedBuilder()
          .setDescription(
            `💰 **<@${parrain.id}>** a reçu **+0,10$** pour avoir invité **${va.username}** !\n\n` +
            `📊 **Total** : **${count}** VA invités · **${totalAffiliation}$** gagnés`
          )
          .setColor('#f1c40f');
        await affiliationChannel.send({ embeds: [affiEmbed] });
        console.log('Message affiliation envoyé');
      }
    } catch (e) {
      console.error('Erreur affiliation:', e.message);
    }
  }

  // ==================
  // ÉTAPE 1 — Bouton "Devenir recruteur" cliqué
  // ==================
  if (interaction.isButton() && interaction.customId === 'devenir_recruteur') {
    const member = interaction.member;
    const guild = interaction.guild;
    const config = getRecruteurConfig(guild.id);

    if (member.roles.cache.has(config.roleId)) {
      return interaction.reply({ content: '⚠️ Tu es déjà recruteur !', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await member.roles.add(config.roleId);

      const channelName = `🎯-${member.user.username}`;
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: config.categoryId,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

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

    await interaction.update({ components: [] });
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

    const confirmEmbed = new EmbedBuilder()
      .setDescription(`✅ Telegram enregistré : **${pseudo}**`)
      .setColor('#2ecc71');

    await interaction.reply({ embeds: [confirmEmbed] });

    const finalEmbed = new EmbedBuilder()
      .setDescription(
        `🎉 **T'es enregistré comme recruteur !**\n\n` +
        `Voici **TOUT** pour commencer — dans l'ordre :\n\n` +
        `1️⃣ **Regarde la vidéo** → <#${EXPLICATION_CHANNEL_ID}>\n` +
        `2️⃣ **Copie ton annonce** → <#${ANNONCES_CHANNEL_ID}>\n` +
        `3️⃣ **Poste-la** dans les groupes → <#${GROUPES_CHANNEL_ID}> (Facebook + Telegram)\n` +
        `4️⃣ Dis à chaque VA de mettre **ton nom** dans le salon **qui-t-a-invité**\n\n` +
        `💰 Chaque VA ramené = **0,50$** (+2$ s'il produit) · aucun plafond\n\n` +
        `**Ramène du monde, encaisse. Let's go 🔥**`
      )
      .setColor('#f1c40f');

    await interaction.channel.send({ embeds: [finalEmbed] });
  }

});

client.login(process.env.DISCORD_TOKEN);
