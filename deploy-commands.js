const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Envoyer un message dans un salon')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Le message à envoyer')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('salon')
        .setDescription('Le salon où envoyer le message')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
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
