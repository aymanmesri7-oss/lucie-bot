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
const VOICE_CHANNEL_ID_2 = '1563114991115046932';

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

// === CONFIG SERVEUR JAILBREAK ===
const JAILBREAK_GUILD_ID = '1563114824475353169';
const JAILBREAK_WELCOME_CHANNEL_ID = '1563114827356967064';

// === CONFIG SERVEUR NOUVEAU (1562930564149940276) ===
const NEW_GUILD_ID = '1562930564149940276';
const NEW_PERSO_CATEGORY_ID = '1562941117261942934';
const NEW_AUTO_ROLE_ID = '1563150512000471040';
const NEW_WELCOME_CHANNEL_ID = '1563123616433053696';

// === TRACKING RECRUTEURS ===
// Volume Railway monté sur /data → le fichier survit aux mises à jour
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'parrainage.json');
const OLD_DATA_FILE = path.join(__dirname, 'recruteurs.json');
// Prime par invitation : 5$ sur Instagram 2, 0,50$ ailleurs (comme avant)
const primePour = guildId => guildId === NEW_GUILD_ID ? 5 : 0.5;

// Format : { invites: [{ va, parrain, guildId, gain, at }], salons: { [guildId]: { prime, classement, classementMsg } } }
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {}
  // Reprendre l'ancien fichier (anciennes invitations à 0,50$)
  const data = { invites: [], salons: {} };
  try {
    const old = JSON.parse(fs.readFileSync(OLD_DATA_FILE, 'utf8'));
    for (const [parrain, info] of Object.entries(old)) {
      for (const va of info.vas || []) data.invites.push({ va, parrain, guildId: null, gain: 0.5, at: null });
    }
  } catch (e) {}
  return data;
}

function statsParrain(data, parrainId) {
  const mine = data.invites.filter(i => i.parrain === parrainId);
  return { count: mine.length, gains: mine.reduce((t, i) => t + i.gain, 0) };
}

// Salon perso du parrain : d'abord sur ce serveur, sinon sur ses autres serveurs
async function findSalonParrain(guildActuel, parrainId) {
  const guilds = [guildActuel, ...client.guilds.cache.filter(g => g.id !== guildActuel.id).values()];
  for (const g of guilds) {
    const catIds = [RECRUTEUR_CATEGORY_ID, RECRU_INSTA_CATEGORY_ID, ...(PERSO_CONFIG[g.id] ? getPersoCategoryIds(g) : [])];
    const salon = g.channels.cache.find(c =>
      c.type === ChannelType.GuildText && catIds.includes(c.parentId) && c.permissionOverwrites.cache.has(parrainId)
    );
    if (salon) return salon;
  }
  return null;
}

// Classement parrainage d'un serveur (mis à jour à chaque invitation)
async function updateClassementParrainage(guild, data) {
  const conf = data.salons[guild.id];
  if (!conf?.classement) return;
  const salon = await guild.channels.fetch(conf.classement).catch(() => null);
  if (!salon) return;

  const scores = {};
  for (const i of data.invites.filter(i => i.guildId === guild.id)) scores[i.parrain] = (scores[i.parrain] || 0) + 1;
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const PRIME_PAR_INVITE = primePour(guild.id);
  const medailles = ['🥇', '🥈', '🥉'];
  const lignes = top.map(([id, n], idx) => {
    const ecart = idx > 0 ? ` · *encore ${top[idx - 1][1] - n + 1} pour passer devant*` : '';
    return `${medailles[idx] || `**${idx + 1}.**`} <@${id}> — **${n}** invité${n > 1 ? 's' : ''} · **${n * PRIME_PAR_INVITE}$**${ecart}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 CLASSEMENT PARRAINAGE 🏆')
    .setDescription(
      (lignes.length ? lignes.join('\n') : '*Personne pour l\'instant… sois le premier !* 👀') +
      `\n\n━━━━━━━━━━━━━━━━━━━━━━\n💰 **${PRIME_PAR_INVITE}$** par personne invitée · aucun plafond\n🔥 Qui va prendre la première place ?`
    )
    .setColor('#f1c40f')
    .setTimestamp();

  const ancien = conf.classementMsg && await salon.messages.fetch(conf.classementMsg).catch(() => null);
  if (ancien) await ancien.edit({ embeds: [embed] });
  else { const msg = await salon.send({ embeds: [embed] }); conf.classementMsg = msg.id; saveData(data); }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', async () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);

  // Rejoindre les vocaux sur tous les serveurs
  const voiceChannels = [VOICE_CHANNEL_ID, VOICE_CHANNEL_ID_2];

  for (const vcId of voiceChannels) {
    try {
      const vc = await client.channels.fetch(vcId);
      if (vc) {
        const conn = joinVoiceChannel({
          channelId: vcId,
          guildId: vc.guild.id,
          adapterCreator: vc.guild.voiceAdapterCreator,
          selfDeaf: true
        });

        conn.on(VoiceConnectionStatus.Disconnected, () => {
          setTimeout(() => {
            joinVoiceChannel({
              channelId: vcId,
              guildId: vc.guild.id,
              adapterCreator: vc.guild.voiceAdapterCreator,
              selfDeaf: true
            });
          }, 5000);
        });

        console.log(`Connecté au vocal sur ${vc.guild.name}`);
      }
    } catch (e) {
      console.error(`Erreur vocal ${vcId}:`, e.message);
    }
  }

  // Commandes parrainage (ajoutées sans effacer les autres)
  for (const [name, description] of [
    ['setupprime', 'Les primes de parrainage seront envoyées dans ce salon'],
    ['setupclassement', 'Installer le classement parrainage dans ce salon'],
  ]) {
    await client.application.commands.create({ name, description, default_member_permissions: String(PermissionFlagsBits.ManageChannels) })
      .catch(e => console.error(`Erreur commande ${name}:`, e.message));
  }

  // Rien d'automatique au démarrage — salons créés uniquement quand un nouveau membre rejoint
  console.log('Bot prêt.');
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

  // Trouver une catégorie avec de la place (max 20 salons par catégorie) — remplir les trous d'abord
  for (const [, cat] of allCategories) {
    const channelsInCat = guild.channels.cache.filter(c => c.parentId === cat.id);
    if (channelsInCat.size < 20) return cat;
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

// === SALONS PERSO : config par serveur ===
const PERSO_CONFIG = {
  [INSTA_GUILD_ID]: { categoryId: INSTA_PERSO_CATEGORY_ID, roleId: INSTA_AUTO_ROLE_ID, lienNouveau: true },
  [NEW_GUILD_ID]: { categoryId: NEW_PERSO_CATEGORY_ID, roleId: NEW_AUTO_ROLE_ID, lienNouveau: false }
};

// Garde que lettres/chiffres/_ pour comparer (Discord change les noms : -1, majuscules, points...)
const clean = s => s.toLowerCase().replace(/[^a-z0-9_]/g, '');

// Toutes les catégories salon perso du serveur (la principale + "NOM 2", "NOM 3"...)
function getPersoCategoryIds(guild) {
  const conf = PERSO_CONFIG[guild.id];
  const base = conf && guild.channels.cache.get(conf.categoryId);
  return guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory &&
      (base ? (c.id === base.id || c.name.startsWith(base.name)) : c.name.toLowerCase().includes('salon perso')))
    .map(c => c.id);
}

// Trouver le salon perso d'un membre (par permission perso OU par nom)
function findPersoChannel(guild, member) {
  const catIds = getPersoCategoryIds(guild);
  const name = clean(member.user.username);
  return guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && catIds.includes(c.parentId) &&
    (c.permissionOverwrites.cache.has(member.id) || clean(c.name) === name)
  );
}

// === FONCTION CRÉER SALON PERSO (tous serveurs) ===
async function createPersoChannel(member) {
  const guild = member.guild;
  const conf = PERSO_CONFIG[guild.id];
  if (!conf) return null;

  const existing = findPersoChannel(guild, member);
  if (existing) return existing;

  const category = await findOrCreateCategory(guild, conf.categoryId);
  if (!category) return null;

  const newChannel = await guild.channels.create({
    name: `📸-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: '977960166945325106', allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
    ]
  });

  const embed = new EmbedBuilder()
    .setDescription(
      `👋 **Salut ! Moi c'est Lucie, bienvenue** 🎉\n\n` +
      (conf.lienNouveau ? `Pour commencer, va dans <#${INSTA_NOUVEAU_CHANNEL_ID}> — tout est là-bas pour t'aider 👇\n\n` : '') +
      `📩 **Envoie les liens de tes comptes ici** dans ton salon perso\n` +
      `🔗 **Viens réclamer ton lien ici** aussi\n` +
      `💬 On est là pour t'aider, hésite pas à écrire !`
    )
    .setColor('#2ecc71');

  await newChannel.send({ embeds: [embed] });
  return newChannel;
}

const guildChannelsFetch = g => g.channels.fetch().catch(() => null);

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

      await guildChannelsFetch(member.guild);
      await createPersoChannel(member);
      console.log(`Salon perso créé pour ${member.user.username}`);
    }

    // Nouveau serveur — rôle auto + bienvenue + salon perso
    if (member.guild.id === NEW_GUILD_ID) {
      try {
        await member.roles.add(NEW_AUTO_ROLE_ID);
      } catch (e) {
        console.error('Erreur rôle auto nouveau serveur:', e.message);
      }

      const newWelcome = await member.guild.channels.fetch(NEW_WELCOME_CHANNEL_ID).catch(() => null);
      if (newWelcome) {
        const newEmbed = new EmbedBuilder()
          .setDescription(
            `👋 **Bienvenue ${member} !**\n\n` +
            `Moi c'est **Lucie**, contente de t'avoir parmi nous 🎉`
          )
          .setColor('#2ecc71')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        await newWelcome.send({ embeds: [newEmbed] });
      }

      // Créer salon perso
      await guildChannelsFetch(member.guild);
      await createPersoChannel(member);
      console.log(`Salon perso créé pour ${member.user.username} sur nouveau serveur`);
    }

    // Serveur Jailbreak — message de bienvenue
    if (member.guild.id === JAILBREAK_GUILD_ID) {
      const jbWelcome = await member.guild.channels.fetch(JAILBREAK_WELCOME_CHANNEL_ID).catch(() => null);
      if (jbWelcome) {
        const jbEmbed = new EmbedBuilder()
          .setDescription(
            `👋 **Bienvenue ${member} !**\n\n` +
            `Moi c'est **Lucie**, contente de t'avoir parmi nous 🎉`
          )
          .setColor('#2ecc71')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        await jbWelcome.send({ embeds: [jbEmbed] });
      }
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

    const conf = PERSO_CONFIG[interaction.guild.id];
    if (!conf) {
      return interaction.reply({ content: '❌ Pas de salons perso sur ce serveur.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    await guild.channels.fetch();
    const members = await guild.members.fetch();
    let salons = 0, roles = 0, erreurs = 0;

    for (const [, member] of members) {
      if (member.user.bot) continue;

      // Rôle VA
      if (conf.roleId && !member.roles.cache.has(conf.roleId)) {
        try { await member.roles.add(conf.roleId); roles++; }
        catch (e) { erreurs++; console.error(`Erreur rôle ${member.user.username}:`, e.message); }
      }

      // Salon perso
      if (!findPersoChannel(guild, member)) {
        try {
          await createPersoChannel(member);
          salons++;
          await new Promise(r => setTimeout(r, 1000)); // pause anti-spam Discord
        } catch (e) {
          erreurs++;
          console.error(`Erreur salon ${member.user.username}:`, e.message);
        }
      }
    }

    await interaction.editReply({
      content: `✅ **${salons}** salons perso créés\n✅ **${roles}** rôles VA donnés` + (erreurs ? `\n⚠️ ${erreurs} erreurs (voir logs Railway)` : '')
    }).catch(() => {});
  }

  // ==================
  // /cleanup → supprimer les doublons
  // ==================
  if (interaction.isChatInputCommand() && interaction.commandName === 'cleanup') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    await guild.channels.fetch();

    // Trouver tous les salons dans les catégories "SALON PERSO"
    const persoCatIds = getPersoCategoryIds(guild);
    const persoChannels = guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText && persoCatIds.includes(c.parentId)
    );

    // Trier par date de création (garder le plus ancien = l'original)
    const sorted = [...persoChannels.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Extraire le username : garder que lettres, chiffres, underscore
    const seen = new Map();
    let deleted = 0;
    const deletedNames = [];

    for (const channel of sorted) {
      const clean = channel.name.replace(/[^a-z0-9_]/g, '').toLowerCase();
      if (!clean) continue;

      if (seen.has(clean)) {
        try {
          deletedNames.push(channel.name);
          await channel.delete('Doublon supprimé par /cleanup');
          deleted++;
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`Erreur suppression ${channel.name}:`, e.message);
        }
      } else {
        seen.set(clean, channel);
      }
    }

    // Supprimer aussi les catégories SALON PERSO vides
    await guild.channels.fetch();
    const emptyCategories = guild.channels.cache.filter(c => {
      if (c.type !== ChannelType.GuildCategory) return false;
      if (!persoCatIds.includes(c.id) || c.id === PERSO_CONFIG[guild.id]?.categoryId) return false;
      const children = guild.channels.cache.filter(ch => ch.parentId === c.id);
      return children.size === 0;
    });

    for (const [, cat] of emptyCategories) {
      try {
        await cat.delete('Catégorie vide');
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {}
    }

    await interaction.editReply({
      content: `✅ **${deleted} doublons supprimés !**${deleted > 0 ? '\n\nSupprimés : ' + deletedNames.join(', ') : '\n\nAucun doublon trouvé.'}`
    });
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
        `Ça lui fait gagner **${primePour(interaction.guild.id)}$** 💰 (une seule fois, choisis bien !)\n\n` +
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
    if (parrain.bot) {
      return interaction.update({ content: '❌ Choisis une vraie personne !', components: [] });
    }

    const data = loadData();

    // Une seule fois par personne, pour toujours
    const deja = data.invites.find(i => i.va === va.id);
    if (deja) {
      return interaction.update({ content: `⚠️ Tu as déjà indiqué <@${deja.parrain}> comme parrain. C'est une seule fois !`, components: [] });
    }

    data.invites.push({ va: va.id, parrain: parrain.id, guildId: guild.id, gain: primePour(guild.id), at: new Date().toISOString() });
    saveData(data);
    const { count, gains } = statsParrain(data, parrain.id);
    const PRIME_PAR_INVITE = primePour(guild.id);

    await interaction.update({ content: `✅ **${parrain.username}** a été notifié ! Merci 🤝`, components: [] });

    // Message dans le salon perso du parrain
    try {
      const salonPerso = await findSalonParrain(guild, parrain.id);
      if (salonPerso) {
        await salonPerso.send({ content: `<@${parrain.id}>`, embeds: [new EmbedBuilder()
          .setDescription(
            `🎉 **${va} t'a désigné comme parrain !**\n\n` +
            `💰 **+${PRIME_PAR_INVITE}$** pour toi\n\n` +
            `📊 **Ton total :**\n` +
            `• Personnes invitées : **${count}**\n` +
            `• Gains : **${gains.toFixed(2)}$**\n\n` +
            `🔥 Continue, chaque personne = **${PRIME_PAR_INVITE}$** de plus !`
          )
          .setColor('#2ecc71')] });
      } else {
        console.log(`Salon perso de ${parrain.username} introuvable`);
      }
    } catch (e) { console.error('Erreur notif parrain:', e.message); }

    // Message dans le salon "prime de parrainage" de ce serveur
    try {
      const primeId = data.salons[guild.id]?.prime;
      const salonPrime = primeId && await guild.channels.fetch(primeId).catch(() => null);
      if (salonPrime) {
        const paliers = { 1: '🌱 Sa première prime !', 5: '🔥 5 personnes invitées !', 10: '💎 10 personnes invitées !', 25: '👑 25 personnes invitées, une légende !', 50: '🚀 50 personnes invitées !!!' };
        await salonPrime.send({ embeds: [new EmbedBuilder()
          .setTitle('💸 NOUVELLE PRIME DE PARRAINAGE 💸')
          .setDescription(
            `<@${parrain.id}> a invité **${va.username}** 🤝\n\n` +
            `## 💰 +${PRIME_PAR_INVITE}$\n\n` +
            (paliers[count] ? `**${paliers[count]}**\n\n` : '') +
            `📊 **${count}** personne${count > 1 ? 's' : ''} invitée${count > 1 ? 's' : ''} · **${gains.toFixed(2)}$** gagnés\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n👉 Toi aussi : invite quelqu'un et prends **${PRIME_PAR_INVITE}$** !`
          )
          .setColor('#f1c40f')
          .setTimestamp()] });
      }
    } catch (e) { console.error('Erreur prime:', e.message); }

    await updateClassementParrainage(guild, data).catch(e => console.error('Erreur classement:', e.message));
  }

  // ==================
  // /setupprime et /setupclassement → choisir les salons parrainage de ce serveur
  // ==================
  if (interaction.isChatInputCommand() && (interaction.commandName === 'setupprime' || interaction.commandName === 'setupclassement')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }
    const data = loadData();
    data.salons[interaction.guild.id] = data.salons[interaction.guild.id] || {};
    const conf = data.salons[interaction.guild.id];
    if (interaction.commandName === 'setupprime') {
      conf.prime = interaction.channel.id;
      saveData(data);
      return interaction.reply({ content: '✅ Les primes de parrainage arriveront dans ce salon !', ephemeral: true });
    }
    conf.classement = interaction.channel.id;
    conf.classementMsg = null;
    saveData(data);
    await interaction.reply({ content: '✅ Classement parrainage installé ici !', ephemeral: true });
    await updateClassementParrainage(interaction.guild, data);
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
