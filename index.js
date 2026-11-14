const {
  Client, GatewayIntentBits, PermissionFlagsBits,
  EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, PermissionsBitField,
  UserSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers
  ]
});

const pendingMessages = new Map();

// === SERVEURS SALONS PERSO ===
const HALO_GUILD_ID = '1566540447487099041';
const COMEBACK_GUILD_ID = '1566758699685515285';
const TWITTER_GUILD_ID = '1570944449658224691';

// === SAUVEGARDE ===
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'parrainage.json');
const primePour = guildId => 2; // 2$ par personne invitée

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {}
  return { invites: [], salons: {} };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Config recruteur du serveur (réglée avec /setuprecruteur)
const getRecruConf = guildId => loadData().salons[guildId]?.recru;

function statsParrain(data, parrainId, guildId) {
  const mine = data.invites.filter(i => i.parrain === parrainId && i.guildId === guildId);
  return { count: mine.length, gains: mine.reduce((t, i) => t + i.gain, 0) };
}

// Salon perso (📸) ou recruteur (🎯) DU parrain, sur CE serveur seulement.
// On vérifie le nom du salon : le manager a accès à tous les salons perso, la permission seule ne suffit pas.
async function findSalonParrain(guild, parrain) {
  const recru = getRecruConf(guild.id);
  const catIds = [...(getPersoConf(guild.id) ? getPersoCategoryIds(guild) : []), ...(recru ? [recru.categoryId] : [])];
  const nom = clean(parrain.username);
  return guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && catIds.includes(c.parentId) && clean(c.name) === nom
  ) || null;
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

// Bouton "Mes parrainages"
const boutonParrainages = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('mes_parrainages').setLabel('📊 Voir qui j\'ai invité').setStyle(ButtonStyle.Primary)
);

// Stats perso + top 10 du serveur
function embedMesParrainages(guild, userId) {
  const data = loadData();
  const PRIME = primePour(guild.id);
  const scores = {};
  for (const i of data.invites.filter(i => i.guildId === guild.id)) scores[i.parrain] = (scores[i.parrain] || 0) + 1;
  const classement = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const pos = classement.findIndex(([id]) => id === userId) + 1;
  const mine = data.invites.filter(i => i.parrain === userId && i.guildId === guild.id);
  const medailles = ['🥇', '🥈', '🥉'];
  const top = classement.slice(0, 10).map(([id, n], idx) =>
    `${medailles[idx] || `**${idx + 1}.**`} <@${id}> — **${n}** invité${n > 1 ? 's' : ''}${id === userId ? ' ⬅️ toi' : ''}`
  );

  return new EmbedBuilder()
    .setTitle('📊 Tes parrainages')
    .setDescription(
      `👥 Personnes invitées : **${mine.length}**\n` +
      `💰 Gains : **${(mine.length * PRIME).toFixed(2)}$**\n` +
      `📍 Position : **${pos ? `#${pos}` : 'pas encore classé'}**\n\n` +
      (mine.length ? `**👀 Qui tu as invité :**\n${mine.slice(-100).map(i => `<@${i.va}>`).join(', ')}\n\n` : '*Tu n\'as encore invité personne.*\n\n') +
      `━━━━━━━━━━━━━━━━━━━━━━\n🏆 **TOP 10**\n` +
      (top.length ? top.join('\n') : '*Personne pour l\'instant… sois le premier !*')
    )
    .setColor('#f1c40f');
}

// === COMMANDES ===
const COMMANDES = [
  { name: 'setupprime', description: 'Les primes de parrainage seront envoyées dans ce salon', default_member_permissions: String(PermissionFlagsBits.ManageChannels) },
  { name: 'setupclassement', description: 'Installer le classement parrainage dans ce salon', default_member_permissions: String(PermissionFlagsBits.ManageChannels) },
  { name: 'setup', description: 'Créer les salons perso et donner le rôle à tous les membres', default_member_permissions: String(PermissionFlagsBits.ManageChannels) },
  { name: 'setupparrainages', description: 'Poster le bouton "Voir qui j\'ai invité" dans ce salon', default_member_permissions: String(PermissionFlagsBits.ManageChannels) },
  { name: 'recruteur', description:'Poster le message "Devenir recruteur" dans ce salon', default_member_permissions: String(PermissionFlagsBits.ManageChannels) },
  {
    name: 'setuprecruteur',
    description: 'Régler le système recruteur de ce serveur',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      { type: 7, name: 'categorie', description: 'Catégorie où créer les salons des recruteurs', channel_types: [ChannelType.GuildCategory], required: true },
      { type: 8, name: 'role', description: 'Rôle donné aux recruteurs', required: true },
      { type: 7, name: 'explication', description: 'Salon explication', channel_types: [ChannelType.GuildText], required: true },
      { type: 7, name: 'annonces', description: 'Salon annonces-à-poster', channel_types: [ChannelType.GuildText], required: true },
      { type: 7, name: 'groupes', description: 'Salon groupe-recrutement', channel_types: [ChannelType.GuildText], required: true }
    ]
  },
  {
    name: 'setupperso',
    description: 'Choisir la catégorie, le rôle et le salon de bienvenue',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      { type: 7, name: 'categorie', description: 'Catégorie des salons perso', channel_types: [ChannelType.GuildCategory], required: true },
      { type: 8, name: 'role', description: 'Rôle donné automatiquement aux nouveaux', required: true },
      { type: 7, name: 'bienvenue', description: 'Salon de bienvenue', channel_types: [ChannelType.GuildText], required: true }
    ]
  },
  { name: 'supprimer-salons', description: 'Supprimer tous les salons perso et leurs catégories', default_member_permissions: String(PermissionFlagsBits.Administrator) },
  {
    name: 'send',
    description: 'Envoyer un message embed dans un salon',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [
      { type: 7, name: 'salon', description: 'Le salon où envoyer', channel_types: [ChannelType.GuildText], required: true },
      { type: 3, name: 'couleur', description: 'Couleur hex (#2ecc71)', required: false }
    ]
  },
  { name: 'invite', description: 'Message "Qui t\'a invité ?" avec bouton', default_member_permissions: String(PermissionFlagsBits.ManageMessages) },
  { name: 'tunnel', description: 'Lancer la formation (étape 1) dans ce salon', default_member_permissions: String(PermissionFlagsBits.ManageMessages) },
  {
    name: 'lien',
    description: 'Donner son lien au VA dans ce salon (lance la suite de la formation)',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [{ type: 3, name: 'lien', description: 'Le lien du VA', required: true }]
  },
  { name: 'setupformation', description: 'Créer le rôle En formation : les nouveaux voient que leur salon perso', default_member_permissions: String(PermissionFlagsBits.Administrator) },
];

client.once('ready', async () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);
  // Remplace toutes les anciennes commandes par celles-ci
  await client.application.commands.set(COMMANDES).catch(e => console.error('Erreur commandes:', e.message));
  console.log('Bot prêt.');
});

// === SALONS PERSO ===
const PERSO_SERVEURS = [HALO_GUILD_ID, COMEBACK_GUILD_ID, TWITTER_GUILD_ID];
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

  return guild.channels.create({
    name: `${baseName} ${allCategories.size + 1}`,
    type: ChannelType.GuildCategory,
    position: baseCategory.position + allCategories.size
  });
}

// === TUNNEL DE FORMATION (Halo Agency) ===
const MANAGER_ID = '977960166945325106';
const SALON_CREER = '1566540448233820198';
const SALON_EXEMPLE = '1566540448540008520';
const SALON_PUBLIER = '1566540448233820200';
const REGARDE = '🎥 **REGARDE LA VIDÉO** 👇';
const BOUTON_VERT = '✅ **PUIS APPUIE SUR LE BOUTON VERT**';

const NE_PUBLIE_RIEN = '⛔ **NE PUBLIE RIEN**';

// Chaque étape : la vidéo (dossier videos/), la couleur, le texte, le bouton qui mène à l'étape suivante
const ETAPES = {
  1: { video: 'bienvenue', couleur: '#2ecc71', lignes: () => ['# 👋 BIENVENUE !', REGARDE, BOUTON_VERT], bouton: "J'AI REGARDÉ ✅" },
  2: { video: 'creer', couleur: '#3498db', lignes: () => [
    '# 📱 CRÉE TON PREMIER COMPTE INSTAGRAM', REGARDE,
    `1️⃣ **REGARDE LE TUTO ICI** → <#${SALON_CREER}>`,
    `2️⃣ **TON COMPTE DOIT ÊTRE COMME ÇA** → <#${SALON_EXEMPLE}>`,
    NE_PUBLIE_RIEN,
    '📩 **ENVOIE SEULEMENT LE LIEN DE TON COMPTE ICI**',
    '✅ **COMPTE CRÉÉ ? APPUIE SUR LE BOUTON VERT**'
  ], bouton: "J'AI CRÉÉ MON COMPTE ✅" },
  3: { video: 'envoyer', couleur: '#e67e22', lignes: () => ['# 📩 ENVOIE LE LIEN DE TON COMPTE ICI', REGARDE, NE_PUBLIE_RIEN] },
  4: { couleur: '#e74c3c', pingBoss: true, lignes: () => [
    '# ✅ BRAVO ! COMPTE REÇU',
    '⏳ **ATTENDS TON LIEN ICI**',
    '💰 **C\'EST AVEC CE LIEN QUE TU GAGNES DES CLICS**',
    NE_PUBLIE_RIEN
  ] },
  5: { video: 'publier', couleur: '#f1c40f', lignes: lien => [
    '# 🔗 VOICI TON LIEN', lien, REGARDE,
    `👉 **COMMENT PUBLIER** → <#${SALON_PUBLIER}>`, BOUTON_VERT
  ], bouton: "J'AI COMPRIS ✅" },
  6: { video: 'routine', couleur: '#9b59b6', lignes: () => [
    '# 📅 TON TRAVAIL DE TOUS LES JOURS', REGARDE,
    '🔥 **CRÉE LE PLUS DE COMPTES POSSIBLE CHAQUE JOUR**',
    '📩 **ENVOIE CHAQUE COMPTE ICI**',
    '💬 **UNE QUESTION ? ÉCRIS ICI**'
  ] }
};

// Envoie l'étape : un cadre de couleur avec le texte, puis la vidéo et le bouton vert juste en dessous
async function envoyerEtape(channel, n, lien) {
  const e = ETAPES[n];
  const fichier = e.video && path.join(__dirname, 'videos', `${e.video}.mp4`);
  // Discord refuse les fichiers de plus de 10 Mo envoyés par un bot
  const aVideo = fichier && fs.existsSync(fichier) && fs.statSync(fichier).size <= 10 * 1024 * 1024;
  if (e.video && !aVideo) console.error(`Vidéo manquante ou trop lourde (max 10 Mo) : videos/${e.video}.mp4`);
  const bouton = e.bouton ? [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tunnel_${n + 1}`).setLabel(e.bouton).setStyle(ButtonStyle.Success)
  )] : [];
  // Étape 4 : on prévient le rôle BOSS (ou le manager si le rôle n'existe pas)
  const boss = e.pingBoss && channel.guild.roles.cache.find(r => r.name.toUpperCase().includes('BOSS'));
  await channel.send({
    content: e.pingBoss ? (boss ? `${boss}` : `<@${MANAGER_ID}>`) : undefined,
    embeds: [new EmbedBuilder().setColor(e.couleur).setDescription(e.lignes(lien).filter(l => aVideo || l !== REGARDE).join('\n\n'))],
    components: aVideo ? [] : bouton
  });
  if (aVideo) await channel.send({ files: [fichier], components: bouton });
}

// Fin de l'étape 1 : on enlève "En formation" et on donne le rôle normal → tout le serveur s'ouvre
async function finirFormation(channel) {
  const conf = loadData().salons[channel.guild.id];
  const va = channel.permissionOverwrites.cache.find(o => o.type === 1 && o.id !== client.user.id && o.id !== MANAGER_ID);
  const member = va && await channel.guild.members.fetch(va.id).catch(() => null);
  if (!member || !conf?.formationRole) return;
  if (conf.perso?.roleId) await member.roles.add(conf.perso.roleId).catch(e => console.error('Erreur rôle:', e.message));
  await member.roles.remove(conf.formationRole).catch(e => console.error('Erreur rôle formation:', e.message));
}

// Salons où Lucie attend le lien Instagram du VA (étape 3)
function attendCompte(channelId, attend) {
  const data = loadData();
  data.tunnel = data.tunnel || {};
  if (attend) data.tunnel[channelId] = true; else delete data.tunnel[channelId];
  saveData(data);
}

client.on('messageCreate', async message => {
  try {
    if (message.author.bot || !/instagram\.com/i.test(message.content)) return;
    if (!loadData().tunnel?.[message.channel.id]) return;
    attendCompte(message.channel.id, false);
    await envoyerEtape(message.channel, 4);
  } catch (e) { console.error('Erreur tunnel:', e.message); }
});

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
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
      ...(manager ? [{ id: manager.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }] : [])
    ]
  });

  if (guild.id === HALO_GUILD_ID) { await envoyerEtape(newChannel, 1); return newChannel; }

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

    // Sur Halo, si /setupformation est fait : rôle "En formation" (il voit que son salon perso)
    const formationRole = member.guild.id === HALO_GUILD_ID && loadData().salons[member.guild.id]?.formationRole;
    await member.roles.add(formationRole || conf.roleId).catch(e => console.error('Erreur rôle auto:', e.message));

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

// === DÉPART : on supprime son salon perso et on prévient les BOSS en privé s'il avait un lien GetMySocial ===
client.on('guildMemberRemove', async member => {
  try {
    const guild = member.guild;
    if (!PERSO_SERVEURS.includes(guild.id)) return;
    await guild.channels.fetch();
    const salon = findPersoChannel(guild, { id: member.id, user: { username: member.user?.username || '' } });
    if (!salon) return;

    // Liens GetMySocial envoyés dans son salon (messages et cadres de Lucie)
    const messages = await salon.messages.fetch({ limit: 100 }).catch(() => null);
    const textes = messages ? [...messages.values()].flatMap(m => [m.content, ...m.embeds.map(e => e.description || '')]) : [];
    const liens = [...new Set(textes.join(' ').match(/https?:\/\/(www\.)?getmysocial\.com\/[^\s)>*]+/gi) || [])];

    if (liens.length) {
      await guild.members.fetch();
      const boss = guild.roles.cache.find(r => r.name.toUpperCase().includes('BOSS'));
      for (const [, b] of boss?.members || []) {
        if (b.user.bot) continue;
        await b.send({ embeds: [new EmbedBuilder()
          .setTitle('🚪 UN VA A QUITTÉ LE SERVEUR')
          .setDescription(`👤 **${member.user?.username || member.id}** a quitté **${guild.name}**\n\n🗑️ **Supprime son lien GetMySocial :**\n${liens.join('\n')}`)
          .setColor('#e74c3c').setTimestamp()] }).catch(() => console.log(`MP impossible à ${b.user.username}`));
      }
    }

    const data = loadData();
    if (data.tunnel?.[salon.id]) { delete data.tunnel[salon.id]; saveData(data); }
    await salon.delete('Le VA a quitté le serveur');
    console.log(`Salon perso de ${member.user?.username} supprimé (départ)`);
  } catch (e) { console.error('Erreur départ:', e.message); }
});

client.on('interactionCreate', async interaction => {

  // Tunnel : /tunnel, /lien et boutons verts
  if (interaction.isChatInputCommand() && interaction.commandName === 'tunnel') {
    await interaction.reply({ content: '✅ Formation lancée ici.', ephemeral: true });
    return envoyerEtape(interaction.channel, 1);
  }
  if (interaction.isChatInputCommand() && interaction.commandName === 'lien') {
    await interaction.reply({ content: '✅ Lien envoyé.', ephemeral: true });
    attendCompte(interaction.channel.id, false);
    return envoyerEtape(interaction.channel, 5, interaction.options.getString('lien'));
  }
  if (interaction.isButton() && interaction.customId.startsWith('tunnel_')) {
    const n = Number(interaction.customId.split('_')[1]);
    if (!ETAPES[n]) return;
    await interaction.update({ components: [] });
    if (n === 3) attendCompte(interaction.channel.id, true);
    if (n === 2) await finirFormation(interaction.channel);
    return envoyerEtape(interaction.channel, n);
  }

  // /setupformation : rôle "En formation" caché de tout sauf des salons perso
  if (interaction.isChatInputCommand() && interaction.commandName === 'setupformation') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const data = loadData();
    const conf = data.salons[guild.id] = data.salons[guild.id] || {};
    let role = conf.formationRole && await guild.roles.fetch(conf.formationRole).catch(() => null);
    if (!role) {
      role = await guild.roles.create({ name: '⏳ En formation' });
      conf.formationRole = role.id;
      saveData(data);
    }
    await guild.channels.fetch();
    const perso = getPersoCategoryIds(guild);
    let ok = 0, erreurs = 0;
    for (const [, ch] of guild.channels.cache) {
      if (perso.includes(ch.id) || perso.includes(ch.parentId) || !ch.permissionOverwrites) continue;
      try { await ch.permissionOverwrites.edit(role, { ViewChannel: false }); ok++; } catch { erreurs++; }
    }
    return interaction.editReply({ content: `✅ Rôle **${role.name}** prêt : caché de **${ok}** salons.` + (erreurs ? `\n⚠️ ${erreurs} salons pas modifiés (Lucie ne les voit pas)` : '') + `\n\n👉 Si tu crées un nouveau salon plus tard, refais /setupformation.` });
  }

  // /setupperso
  if (interaction.isChatInputCommand() && interaction.commandName === 'setupperso') {
    if (!PERSO_SERVEURS.includes(interaction.guild?.id)) {
      return interaction.reply({ content: '❌ Cette commande marche que sur Halo Agency et Instagram Come Back.', ephemeral: true });
    }
    const data = loadData();
    data.salons[interaction.guild.id] = data.salons[interaction.guild.id] || {};
    data.salons[interaction.guild.id].perso = {
      categoryId: interaction.options.getChannel('categorie').id,
      roleId: interaction.options.getRole('role').id,
      welcomeId: interaction.options.getChannel('bienvenue').id
    };
    saveData(data);
    return interaction.reply({ content: '✅ Réglé ! Les nouveaux auront leur rôle et leur salon perso. Fais /setup pour les membres déjà là.', ephemeral: true });
  }

  // /setuprecruteur
  if (interaction.isChatInputCommand() && interaction.commandName === 'setuprecruteur') {
    const data = loadData();
    data.salons[interaction.guild.id] = data.salons[interaction.guild.id] || {};
    data.salons[interaction.guild.id].recru = {
      categoryId: interaction.options.getChannel('categorie').id,
      roleId: interaction.options.getRole('role').id,
      explicationId: interaction.options.getChannel('explication').id,
      annoncesId: interaction.options.getChannel('annonces').id,
      groupesId: interaction.options.getChannel('groupes').id
    };
    saveData(data);
    return interaction.reply({ content: '✅ Système recruteur réglé ! Maintenant fais /recruteur dans le salon devenir-recruteur.', ephemeral: true });
  }

  // /setup
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
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
    pendingMessages.delete(interaction.user.id);
    if (!channel) return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });
    try {
      await channel.send({ embeds: [new EmbedBuilder().setDescription(message).setColor(pending.couleur)] });
      await interaction.reply({ content: `✅ Message envoyé dans ${channel}`, ephemeral: true });
    } catch { await interaction.reply({ content: `❌ Erreur d'envoi`, ephemeral: true }); }
  }

  // /recruteur → message avec bouton
  if (interaction.isChatInputCommand() && interaction.commandName === 'recruteur') {
    if (!getRecruConf(interaction.guild.id)) {
      return interaction.reply({ content: '❌ Fais /setuprecruteur d\'abord.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setDescription(
        '🎯 **Deviens recruteur !**\n\n' +
        'Tu veux **gagner de l\'argent** en ramenant des VA ?\n\n' +
        '💰 **2$** par personne invitée\n' +
        'Aucun plafond — plus t\'en ramènes, plus tu gagnes.\n\n' +
        '👇 Clique pour commencer !'
      )
      .setColor('#f1c40f');
    const button = new ButtonBuilder().setCustomId('devenir_recruteur').setLabel('🚀 Devenir recruteur').setStyle(ButtonStyle.Success);
    await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    await interaction.reply({ content: '✅ Message recruteur posté !', ephemeral: true });
  }

  // Bouton "Devenir recruteur"
  if (interaction.isButton() && interaction.customId === 'devenir_recruteur') {
    const member = interaction.member;
    const guild = interaction.guild;
    const config = getRecruConf(guild.id);
    if (!config) return interaction.reply({ content: '❌ Système pas encore réglé, préviens un admin.', ephemeral: true });

    const dejaSalon = guild.channels.cache.find(c => c.parentId === config.categoryId && c.permissionOverwrites.cache.has(member.id));
    if (dejaSalon || member.roles.cache.has(config.roleId)) {
      return interaction.reply({ content: `⚠️ Tu es déjà recruteur !${dejaSalon ? ` Ton salon : ${dejaSalon}` : ''}`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const newChannel = await guild.channels.create({
        name: `🎯-${member.user.username}`,
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
          `💰 **2$** par personne invitée\n` +
          `Aucun plafond — plus t'en ramènes, plus tu gagnes.`
        )
        .setColor('#2ecc71');
      const btn1 = new ButtonBuilder().setCustomId('recru_step2').setLabel('C\'est parti ✅').setStyle(ButtonStyle.Success);

      await newChannel.send({ embeds: [embed1], components: [new ActionRowBuilder().addComponents(btn1)] });

      // Le rôle après le salon : si le rôle bloque, la personne a quand même son salon
      await member.roles.add(config.roleId).catch(e => console.error('Erreur rôle recruteur:', e.message));

      await interaction.editReply({ content: `✅ T'es recruteur ! Ton salon perso : ${newChannel}` });
    } catch (error) {
      console.error('Erreur recruteur:', error.message);
      await interaction.editReply({ content: `❌ Erreur : ${error.message}\n\n👉 Vérifie que Lucie a la permission **Gérer les salons** et **Gérer les rôles**, et que son rôle est **au-dessus** du rôle recruteur.` });
    }
  }

  // Étape 2
  if (interaction.isButton() && interaction.customId === 'recru_step2') {
    const embed2 = new EmbedBuilder()
      .setDescription(
        `📱 **Prépare ton Telegram**\n\n` +
        `Il te faut un **compte Telegram propre** pour poster les annonces.\n\n` +
        `❓ Un souci ? **Écris directement ici** — un manager te répond.\n\n` +
        `Quand c'est bon 👇`
      )
      .setColor('#3498db');
    const btn2 = new ButtonBuilder().setCustomId('recru_step3').setLabel('Mon Telegram est prêt ✅').setStyle(ButtonStyle.Success);
    await interaction.update({ components: [] });
    await interaction.channel.send({ embeds: [embed2], components: [new ActionRowBuilder().addComponents(btn2)] });
  }

  // Étape 3
  if (interaction.isButton() && interaction.customId === 'recru_step3') {
    const embed3 = new EmbedBuilder()
      .setDescription(
        `📩 **Envoie ton @Telegram**\n\n` +
        `Dernière étape : envoie ton **@pseudo Telegram** — c'est comme ça qu'on te suit.\n\n` +
        `⚠️ Tu es **bloqué** tant que tu l'as pas envoyé.`
      )
      .setColor('#e67e22');
    const btn3 = new ButtonBuilder().setCustomId('recru_send_telegram').setLabel('📩 Envoyer mon @Telegram').setStyle(ButtonStyle.Success);
    await interaction.update({ components: [] });
    await interaction.channel.send({ embeds: [embed3], components: [new ActionRowBuilder().addComponents(btn3)] });
  }

  // Popup @Telegram
  if (interaction.isButton() && interaction.customId === 'recru_send_telegram') {
    const modal = new ModalBuilder().setCustomId('telegram_modal').setTitle('Ton @Telegram');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('telegram_pseudo').setLabel('Ton @pseudo Telegram').setStyle(TextInputStyle.Short).setPlaceholder('@monpseudo').setRequired(true)
    ));
    await interaction.showModal(modal);
  }

  // Étape 4 — final
  if (interaction.isModalSubmit() && interaction.customId === 'telegram_modal') {
    const pseudo = interaction.fields.getTextInputValue('telegram_pseudo');
    const conf = getRecruConf(interaction.guild.id) || {};

    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Telegram enregistré : **${pseudo}**`).setColor('#2ecc71')] });

    const finalEmbed = new EmbedBuilder()
      .setDescription(
        `🎉 **T'es enregistré comme recruteur !**\n\n` +
        `Voici **TOUT** pour commencer — dans l'ordre :\n\n` +
        `1️⃣ **Regarde la vidéo** → <#${conf.explicationId}>\n` +
        `2️⃣ **Copie ton annonce** → <#${conf.annoncesId}>\n` +
        `3️⃣ **Poste-la** dans les groupes → <#${conf.groupesId}> (Facebook + Telegram)\n` +
        `4️⃣ Dis à chaque VA de mettre **ton nom** dans le salon **qui-t-a-invité**\n\n` +
        `💰 Chaque personne invitée = **2$** · aucun plafond\n\n` +
        `**Ramène du monde, encaisse. Let's go 🔥**`
      )
      .setColor('#f1c40f');
    await interaction.channel.send({ embeds: [finalEmbed], components: [boutonParrainages()] });
  }

  // /setupparrainages → panneau avec le bouton dans ce salon
  if (interaction.isChatInputCommand() && interaction.commandName === 'setupparrainages') {
    await interaction.channel.send({ embeds: [new EmbedBuilder()
      .setTitle('📊 TES PARRAINAGES')
      .setDescription(
        `Clique sur le bouton pour voir :\n\n` +
        `👀 **Qui tu as invité**\n💰 **Combien tu as gagné**\n📍 **Ta place** dans le classement\n🏆 **Le top 10**\n\n` +
        `💸 **${primePour(interaction.guild.id)}$** par personne invitée · aucun plafond`
      )
      .setColor('#f1c40f')], components: [boutonParrainages()] });
    return interaction.reply({ content: '✅ Bouton posté !', ephemeral: true });
  }

  // Bouton "Voir qui j'ai invité"
  if (interaction.isButton() && interaction.customId === 'mes_parrainages') {
    return interaction.reply({ embeds: [embedMesParrainages(interaction.guild, interaction.user.id)], ephemeral: true });
  }

  // /invite
  if (interaction.isChatInputCommand() && interaction.commandName === 'invite') {
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
    const { count, gains } = statsParrain(data, parrain.id, guild.id);

    await interaction.update({ content: `✅ **${parrain.username}** a été notifié ! Merci 🤝`, components: [] });

    try {
      const salonPerso = await findSalonParrain(guild, parrain);
      if (salonPerso) {
        await salonPerso.send({ content: `<@${parrain.id}>`, embeds: [new EmbedBuilder()
          .setDescription(`🎉 **${va} t'a désigné comme parrain !**\n\n💰 **+${PRIME}$** pour toi\n\n📊 **Ton total :**\n• Personnes invitées : **${count}**\n• Gains : **${gains.toFixed(2)}$**\n\n🔥 Continue, chaque personne = **${PRIME}$** de plus !`)
          .setColor('#2ecc71'), embedMesParrainages(guild, parrain.id)], components: [boutonParrainages()] });
      } else {
        console.log(`${parrain.username} n'a pas de salon perso sur ${guild.name}`);
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
