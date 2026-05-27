const { ActionRowBuilder, ButtonBuilder } = require('discord.js');

function disableAllComponents(rows) {
    return rows.map(row => {
        const newRow = new ActionRowBuilder();
        newRow.addComponents(
            row.components.map(btn => ButtonBuilder.from(btn.toJSON()).setDisabled(true))
        );
        return newRow;
    });
}

module.exports = { disableAllComponents };
