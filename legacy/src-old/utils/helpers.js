module.exports = {
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    
    formatTime: (ms) => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        let timeString = '';
        if (hours > 0) timeString += `${hours} saat `;
        if (minutes > 0) timeString += `${minutes} dakika `;
        if (seconds > 0) timeString += `${seconds} saniye`;
        return timeString.trim();
    }
};