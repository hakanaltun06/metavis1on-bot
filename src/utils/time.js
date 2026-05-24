const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getMins = (ms) => Math.ceil(ms / 60000);

function splitHoursMins(ms) {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return { hours, mins };
}

module.exports = { rand, getMins, splitHoursMins };
