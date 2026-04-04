const admin = require('firebase-admin');
const { ECONOMY } = require('../utils/constants');

// .env dosyasından Firebase ayarlarını çekiyoruz
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    })
});

const db = admin.firestore();

const defaultUserSchema = {
    wallet: ECONOMY.STARTING_BALANCE,
    bank: 0,
    bankMax: ECONOMY.BANK_MAX_DEFAULT,
    xp: 0,
    level: 1,
    inventory: [],
    cooldowns: { daily: 0, work: 0, beg: 0, crime: 0, rob: 0 },
    stats: { 
        dailyUses: 0, workUses: 0, begUses: 0, crimeAttempts: 0, robAttempts: 0, 
        totalEarned: 0, totalLost: 0, marketPurchases: 0 
    },
    flags: { blacklisted: false, frozen: false },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
};

async function getUser(userId) {
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
        await userRef.set(defaultUserSchema);
        return defaultUserSchema;
    }
    return doc.data();
}

async function updateUser(userId, data) {
    const userRef = db.collection('users').doc(userId);
    data.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await userRef.set(data, { merge: true });
}

module.exports = { db, getUser, updateUser };