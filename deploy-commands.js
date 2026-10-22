const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Envoyer un message stylé dans un salon')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Le message à envoyer')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('salon')
        .setDescription('Le salon où envoyer')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('couleur')
        .setDescription('Couleur de la barre (optionnel)')
        .setRequired(false)
        .addChoices(
          { name: '🟢 Vert', value: '#2ecc71' },
          { name: '🔵 Bleu', value: '#3498db' },
          { name: '🟡 Jaune', value: '#f1c40f' },
          { name: '🔴 Rouge', value: '#e74c3c' },
          { name: '🟣 Violet', value: '#9b59b6' },
          { name: '🟠 Orange', value: '#e67e22' }
        ))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('recruteur')
    .setDescription('Poster le message "Devenir recruteur" avec le bouton')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Poster le message "Qui t\'a invité ?" avec le bouton')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Créer les salons perso pour tous les membres qui en ont pas')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Supprimer les salons perso en double')
    .toJSON()
];

const rest = new REST().setToken(TOKEN);

(async () => {
  try {
    console.log('Enregistrement des commandes slash...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Commandes enregistrées !');
  } catch (error) {
    console.error(error);
  }
})();
