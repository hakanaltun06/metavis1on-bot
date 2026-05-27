const { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

function disableAllComponents(rows) {
    return rows.map(row => {
        const newRow = new ActionRowBuilder();
        newRow.addComponents(
            row.components.map(component => {
                const json = component.toJSON();
                if (json.type === ComponentType.StringSelect) {
                    return StringSelectMenuBuilder.from(json).setDisabled(true);
                }
                return ButtonBuilder.from(json).setDisabled(true);
            })
        );
        return newRow;
    });
}

module.exports = { disableAllComponents };
