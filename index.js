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
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const pendingMessages = new Map();

// === CONFIG SERVEUR HALO AGENCY ===
const HALO_GUILD_ID = '1566540447487099041';

// === CONFIG SERVEUR INSTAGRAM COME BACK ===
const COMEBACK_GUILD_ID = '1566758699685515285';

// === TRACKING RECRUTEURS ===
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'parrainage.json');
const primePour = guildId => 0.5;

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {}
  return { invites: [], salons: {} };
}

function statsParrain(data, parrainId) {
  const mine = data.invites.filter(i => i.parrain === parrainId);
  return { count: mine.length, gains: mine.reduce((t, i) => t + i.gain, 0) };
}

async function findSalonParrain(guildActuel, parrainId) {
  const guilds = [guildActuel, ...client.guilds.cache.filter(g => g.id !== guildActuel.id).values()];
  for (const g of guilds) {
    const catIds = getPersoConf(g.id) ? getPersoCategoryIds(g) : [];
    const salon = g.channels.cache.find(c =>
      c.type === ChannelType.GuildText && catIds.includes(c.parentId) && c.permissionOverwrites.cache.has(parrainId)
    );
    if (salon) return salon;
  }
  return null;
}

async function updateClassementParrainage(guild, data) {
  const conf = data.salons[guild.id];
  if (!conf?.classement) return;
  const salon = await guild.channels.fetch(conf.classement).catch(() => null);
  if (!salon) return;

  const scores = {};
  for (const i of data.invites.filter(i => i.guildId === guild.id)) scores[i.parrain] = (scores[i.parrain] || 0) + 1;
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const PRIME = primePour(guild.id);
  const medailles = ['🥇', '🥈', '🥉'];
  const lignes = top.map(([id, n], idx) => {
    const ecart = idx > 0 ? ` · *encore ${top[idx - 1][1] - n + 1} pour passer devant*` : '';
    return `${medailles[idx] || `**${idx + 1}.**`} <@${id}> — **${n}** invité${n > 1 ? 's' : ''} · **${n * PRIME}$**${ecart}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 CLASSEMENT PARRAINAGE 🏆')
    .setDescription(
      (lignes.length ? lignes.join('\n') : '*Personne pour l\'instant… sois le premier !* 👀') +
      `\n\n━━━━━━━━━━━━━━━━━━━━━━\n💰 **${PRIME}$** par personne invitée · aucun plafond\n🔥 Qui va prendre la première place ?`
    )
    .setColor('#f1c40f').setTimestamp();

  const ancien = conf.classementMsg && await salon.messages.fetch(conf.classementMsg).catch(() => null);
  if (ancien) await ancien.edit({ embeds: [embed] });
  else { const msg = await salon.send({ embeds: [embed] }); conf.classementMsg = msg.id; saveData(data); }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', async () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);

  for (const [name, description] of [
    ['setupprime', 'Les primes de parrainage seront envoyées dans ce salon'],
    ['setupclassement', 'Installer le classement parrainage dans ce salon'],
    ['setup', 'Créer les salons perso et donner le rôle à tous les membres'],
  ]) {
    await client.application.commands.create({ name, description, default_member_permissions: String(PermissionFlagsBits.ManageChannels) })
      .catch(e => console.error(`Erreur commande ${name}:`, e.message));
  }

  await client.application.commands.create({
    name: 'setupperso',
    description: 'Choisir la catégorie, le rôle et le salon de bienvenue',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      { type: 7, name: 'categorie', description: 'Catégorie des salons perso', channel_types: [ChannelType.GuildCategory], required: true },
      { type: 8, name: 'role', description: 'Rôle donné automatiquement aux nouveaux', required: true },
      { type: 7, name: 'bienvenue', description: 'Salon de bienvenue', channel_types: [ChannelType.GuildText], required: true }
    ]
  }).catch(e => console.error('Erreur commande setupperso:', e.message));

  await client.application.commands.create({
    name: 'supprimer-salons',
    description: 'Supprimer tous les salons perso et leurs catégories',
    default_member_permissions: String(PermissionFlagsBits.Administrator)
  }).catch(e => console.error('Erreur commande supprimer-salons:', e.message));

  await client.application.commands.create({
    name: 'send',
    description: 'Envoyer un message embed dans un salon',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [
      { type: 7, name: 'salon', description: 'Le salon où envoyer', channel_types: [ChannelType.GuildText], required: true },
      { type: 3, name: 'couleur', description: 'Couleur hex (#2ecc71)', required: false }
    ]
  }).catch(e => console.error('Erreur commande send:', e.message));

  await client.application.commands.create({
    name: 'invite',
    description: 'Message "Qui t\'a invité ?" avec bouton',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages)
  }).catch(e => console.error('Erreur commande invite:', e.message));

  console.log('Bot prêt.');
});

// === SALONS PERSO ===
const PERSO_SERVEURS = [HALO_GUILD_ID, COMEBACK_GUILD_ID];
const getPersoConf = guildId =>
  PERSO_SERVEURS.includes(guildId) ? loadData().salons[guildId]?.perso : undefined;

const clean = s => s.toLowerCase().replace(/[^a-z0-9_]/g, '');

function getPersoCategoryIds(guild) {
  const conf = getPersoConf(guild.id);
  const base = conf && guild.channels.cache.get(conf.categoryId);
  return guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory &&
      (base ? (c.id === base.id || c.name.startsWith(base.name)) : c.name.toLowerCase().includes('salon perso')))
    .map(c => c.id);
}

function findPersoChannel(guild, member) {
  const catIds = getPersoCategoryIds(guild);
  const name = clean(member.user.username);
  return guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && catIds.includes(c.parentId) &&
    (c.permissionOverwrites.cache.has(member.id) || clean(c.name) === name)
  );
}

async function findOrCreateCategory(guild, baseCategoryId) {
  const baseCategory = await guild.channels.fetch(baseCategoryId).catch(() => null);
  if (!baseCategory) return null;
  const baseName = baseCategory.name;
  const allCategories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory && (c.id === baseCategoryId || c.name.startsWith(baseName)))
    .sort((a, b) => a.position - b.position);

  for (const [, cat] of allCategories) {
    if (guild.channels.cache.filter(c => c.parentId === cat.id).size < 20) return cat;
  }

  const newCategory = await guild.channels.create({
    name: `${baseName} ${allCategories.size + 1}`,
    type: ChannelType.GuildCategory,
    position: baseCategory.position + allCategories.size
  });
  return newCategory;
}

async function createPersoChannel(member) {
  const guild = member.guild;
  const conf = getPersoConf(guild.id);
  if (!conf) return null;

  const existing = findPersoChannel(guild, member);
  if (existing) return existing;

  const category = await findOrCreateCategory(guild, conf.categoryId);
  if (!category) return null;

  const manager = await guild.members.fetch('977960166945325106').catch(() => null);

  const newChannel = await guild.channels.create({
    name: `📸-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...(manager ? [{ id: manager.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }] : [])
    ]
  });

  await newChannel.send({ embeds: [new EmbedBuilder()
    .setDescription(
      `👋 **Salut ! Moi c'est Lucie, bienvenue** 🎉\n\n` +
      `📩 **Envoie les liens de tes comptes ici** dans ton salon perso\n` +
      `🔗 **Viens réclamer ton lien ici** aussi\n` +
      `💬 On est là pour t'aider, hésite pas à écrire !`
    )
    .setColor('#2ecc71')] });

  return newChannel;
}

// === BIENVENUE ===
client.on('guildMemberAdd', async member => {
  try {
    if (!PERSO_SERVEURS.includes(member.guild.id)) return;

    const conf = getPersoConf(member.guild.id);
    if (!conf) { console.error(`/setupperso pas encore fait sur ${member.guild.name}`); return; }

    await member.roles.add(conf.roleId).catch(e => console.error('Erreur rôle auto:', e.message));

    const salon = await member.guild.channels.fetch(conf.welcomeId).catch(() => null);
    if (salon) {
      await salon.send({ embeds: [new EmbedBuilder()
        .setDescription(`👋 **Bienvenue ${member} !**\n\nMoi c'est **Lucie**, contente de t'avoir parmi nous 🎉`)
        .setColor('#2ecc71')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))] });
    }

    await member.guild.channels.fetch();
    await createPersoChannel(member);
    console.log(`Salon perso créé pour ${member.user.username} sur ${member.guild.name}`);
  } catch (error) {
    console.error('Erreur bienvenue:', error);
  }
});

client.on('interactionCreate', async interaction => {

  // /setupperso
  if (interaction.isChatInputCommand() && interaction.commandName === 'setupperso') {
    if (!PERSO_SERVEURS.includes(interaction.guild?.id) || !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Commande réservée aux admins.', ephemeral: true });
    }
    const data = loadData();
    data.salons[interaction.guild.id] = data.salons[interaction.guild.id] || {};
    data.salons[interaction.guild.id].perso = {
      categoryId: interaction.options.getChannel('categorie').id,
      roleId: interaction.options.getRole('role').id,
      welcomeId: interaction.options.getChannel('bienvenue').id,
      lienNouveau: false
    };
    saveData(data);
    return interaction.reply({ content: '✅ Réglé ! Les nouveaux auront leur rôle et leur salon perso. Fais /setup pour les membres déjà là.', ephemeral: true });
  }

  // /setup
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }
    const conf = getPersoConf(interaction.guild.id);
    if (!conf) return interaction.reply({ content: '❌ Fais /setupperso d\'abord.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    await guild.channels.fetch();
    const members = await guild.members.fetch();
    let salons = 0, roles = 0, erreurs = 0;

    for (const [, member] of members) {
      if (member.user.bot) continue;
      if (conf.roleId && !member.roles.cache.has(conf.roleId)) {
        try { await member.roles.add(conf.roleId); roles++; } catch { erreurs++; }
      }
      if (!findPersoChannel(guild, member)) {
        try { await createPersoChannel(member); salons++; await new Promise(r => setTimeout(r, 1000)); } catch { erreurs++; }
      }
    }

    await interaction.editReply({ content: `✅ **${salons}** salons perso créés\n✅ **${roles}** rôles donnés` + (erreurs ? `\n⚠️ ${erreurs} erreurs` : '') }).catch(() => {});
  }

  // /supprimer-salons
  const purgeCmd = interaction.isChatInputCommand() && interaction.commandName === 'supprimer-salons';
  const purgeBtn = interaction.isButton() && interaction.customId === 'confirm_supprimer_salons';
  if (purgeCmd || purgeBtn) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Commande réservée aux admins.', ephemeral: true });
    }

    if (purgeCmd) await interaction.deferReply({ ephemeral: true });
    else await interaction.update({ content: '⏳ Suppression en cours...', components: [] });

    const guild = interaction.guild;
    await guild.channels.fetch();
    const catIds = getPersoCategoryIds(guild);
    const categories = [...guild.channels.cache.filter(c => catIds.includes(c.id)).values()];
    const salons = [...guild.channels.cache.filter(c => catIds.includes(c.parentId)).values()];

    if (purgeCmd) {
      if (!categories.length) return interaction.editReply({ content: 'Aucune catégorie trouvée.' });
      const button = new ButtonBuilder().setCustomId('confirm_supprimer_salons').setLabel(`Supprimer ${salons.length} salons`).setStyle(ButtonStyle.Danger);
      return interaction.editReply({
        content: `⚠️ **${salons.length} salons** et **${categories.length} catégories** vont être supprimés.\n\n**C'est définitif.**`,
        components: [new ActionRowBuilder().addComponents(button)]
      });
    }

    let supprimes = 0, erreurs = 0;
    for (const salon of [...salons, ...categories]) {
      if (salon.type === ChannelType.GuildCategory && erreurs) continue;
      try { await salon.delete('Supprimé par /supprimer-salons'); supprimes++; await new Promise(r => setTimeout(r, 1000)); } catch { erreurs++; }
    }
    await interaction.editReply({ content: `✅ **${supprimes}** supprimés` + (erreurs ? `\n⚠️ ${erreurs} erreurs` : '') }).catch(() => {});
  }

  // /send
  if (interaction.isChatInputCommand() && interaction.commandName === 'send') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('salon');
    const couleur = interaction.options.getString('couleur') || '#2ecc71';
    pendingMessages.set(interaction.user.id, { channelId: channel.id, couleur });

    const modal = new ModalBuilder().setCustomId('send_modal').setTitle('Envoyer un message');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('message_content').setLabel('Ton message').setStyle(TextInputStyle.Paragraph).setRequired(true)
    ));
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'send_modal') {
    const pending = pendingMessages.get(interaction.user.id);
    if (!pending) return interaction.reply({ content: '❌ Erreur, réessaie /send', ephemeral: true });
    const message = interaction.fields.getTextInputValue('message_content');
    const channel = interaction.guild.channels.cache.get(pending.channelId);
    if (!channel) { pendingMessages.delete(interaction.user.id); return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true }); }
    try {
      await channel.send({ embeds: [new EmbedBuilder().setDescription(message).setColor(pending.couleur)] });
      await interaction.reply({ content: `✅ Message envoyé dans ${channel}`, ephemeral: true });
    } catch { await interaction.reply({ content: `❌ Erreur d'envoi`, ephemeral: true }); }
    pendingMessages.delete(interaction.user.id);
  }

  // /invite
  if (interaction.isChatInputCommand() && interaction.commandName === 'invite') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }
    const PRIME = primePour(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setDescription(`🤝 **Qui t'a invité ?**\n\nBienvenue ! 👋\n\nSi quelqu'un t'a fait venir ici, clique le bouton et **choisis son nom**.\nÇa lui fait gagner **${PRIME}$** 💰 (une seule fois !)\n\n👇 Clique pour indiquer qui t'a invité !`)
      .setColor('#2ecc71');
    const button = new ButtonBuilder().setCustomId('qui_invite').setLabel('🤝 Indiquer qui m\'a invité').setStyle(ButtonStyle.Success);
    await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    await interaction.reply({ content: '✅ Message posté !', ephemeral: true });
  }

  // Bouton "Qui t'a invité"
  if (interaction.isButton() && interaction.customId === 'qui_invite') {
    const userSelect = new UserSelectMenuBuilder().setCustomId('select_parrain').setPlaceholder('Choisis la personne qui t\'a invité').setMinValues(1).setMaxValues(1);
    await interaction.reply({ content: '👇 **Choisis la personne qui t\'a invité :**', components: [new ActionRowBuilder().addComponents(userSelect)], ephemeral: true });
  }

  // Personne choisie
  if (interaction.isUserSelectMenu() && interaction.customId === 'select_parrain') {
    const parrain = interaction.users.first();
    const va = interaction.user;
    const guild = interaction.guild;

    if (parrain.id === va.id) return interaction.update({ content: '❌ Tu peux pas te choisir toi-même !', components: [] });
    if (parrain.bot) return interaction.update({ content: '❌ Choisis une vraie personne !', components: [] });

    const data = loadData();
    const deja = data.invites.find(i => i.va === va.id);
    if (deja) return interaction.update({ content: `⚠️ Tu as déjà indiqué <@${deja.parrain}> comme parrain.`, components: [] });

    const PRIME = primePour(guild.id);
    data.invites.push({ va: va.id, parrain: parrain.id, guildId: guild.id, gain: PRIME, at: new Date().toISOString() });
    saveData(data);
    const { count, gains } = statsParrain(data, parrain.id);

    await interaction.update({ content: `✅ **${parrain.username}** a été notifié ! Merci 🤝`, components: [] });

    try {
      const salonPerso = await findSalonParrain(guild, parrain.id);
      if (salonPerso) {
        await salonPerso.send({ content: `<@${parrain.id}>`, embeds: [new EmbedBuilder()
          .setDescription(`🎉 **${va} t'a désigné comme parrain !**\n\n💰 **+${PRIME}$** pour toi\n\n📊 **Ton total :**\n• Personnes invitées : **${count}**\n• Gains : **${gains.toFixed(2)}$**\n\n🔥 Continue, chaque personne = **${PRIME}$** de plus !`)
          .setColor('#2ecc71')] });
      }
    } catch (e) { console.error('Erreur notif parrain:', e.message); }

    try {
      const primeId = data.salons[guild.id]?.prime;
      const salonPrime = primeId && await guild.channels.fetch(primeId).catch(() => null);
      if (salonPrime) {
        const paliers = { 1: '🌱 Sa première prime !', 5: '🔥 5 personnes invitées !', 10: '💎 10 personnes invitées !', 25: '👑 25 personnes invitées !' };
        await salonPrime.send({ embeds: [new EmbedBuilder()
          .setTitle('💸 NOUVELLE PRIME DE PARRAINAGE 💸')
          .setDescription(`<@${parrain.id}> a invité **${va.username}** 🤝\n\n## 💰 +${PRIME}$\n\n${paliers[count] ? `**${paliers[count]}**\n\n` : ''}📊 **${count}** personne${count > 1 ? 's' : ''} invitée${count > 1 ? 's' : ''} · **${gains.toFixed(2)}$** gagnés\n\n━━━━━━━━━━━━━━━━━━━━━━\n👉 Toi aussi : invite quelqu'un et prends **${PRIME}$** !`)
          .setColor('#f1c40f').setTimestamp()] });
      }
    } catch (e) { console.error('Erreur prime:', e.message); }

    await updateClassementParrainage(guild, data).catch(e => console.error('Erreur classement:', e.message));
  }

  // /setupprime et /setupclassement
  if (interaction.isChatInputCommand() && (interaction.commandName === 'setupprime' || interaction.commandName === 'setupclassement')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }
    const data = loadData();
    data.salons[interaction.guild.id] = data.salons[interaction.guild.id] || {};
    if (interaction.commandName === 'setupprime') {
      data.salons[interaction.guild.id].prime = interaction.channel.id;
      saveData(data);
      return interaction.reply({ content: '✅ Les primes de parrainage arriveront dans ce salon !', ephemeral: true });
    }
    data.salons[interaction.guild.id].classement = interaction.channel.id;
    data.salons[interaction.guild.id].classementMsg = null;
    saveData(data);
    await interaction.reply({ content: '✅ Classement parrainage installé ici !', ephemeral: true });
    await updateClassementParrainage(interaction.guild, data);
  }
});

client.login(process.env.DISCORD_TOKEN);
