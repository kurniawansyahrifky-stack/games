const https = require('https');

const TOKEN = '9192955519:AAHnjTxsZmsSq93q8ssIdwbo8enY6LYkj4Y';
const REQUIRED_CHANNEL = '@storegarf';
const CHANNEL_LINK = 'https://t.me/storegarf';

let lastOffset = 0;

// Database Koin (Saldo Awal 1,000 GarfCoins)
const userCoins = {}; 

// Data Room Mabar per Chat/Grup
// { chatId: { hostId, mode, maxPlayers, baseBet, players: [{userId, name, choice, bet, points}], isOpen, messageId, step, round } }
const mabarRooms = {}; 
const soloGames = {}; // { userId: { bet } }

console.log("🤖 Bot garf.games (Fixed Mabar Flow: Lobby Join -> Host Set Bet -> Player Custom Bet) Berjalan...");

function getCoins(userId) {
    if (!userCoins[userId]) userCoins[userId] = 1000;
    return userCoins[userId];
}

function checkMembership(userId, callback) {
    const channelId = encodeURIComponent(REQUIRED_CHANNEL);
    const path = `/bot${TOKEN}/getChatMember?chat_id=${channelId}&user_id=${userId}`;

    https.get(`https://api.telegram.org${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result) {
                    const status = response.result.status;
                    if (['creator', 'administrator', 'member'].includes(status)) {
                        callback(true);
                        return;
                    }
                }
            } catch (e) {}
            callback(false);
        });
    }).on('error', () => callback(false));
}

function checkUpdates() {
    https.get(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${lastOffset}&timeout=30`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result) {
                    response.result.forEach(update => {
                        lastOffset = update.update_id + 1;
                        if (update.message) handleMessage(update.message);
                        if (update.callback_query) handleCallback(update.callback_query);
                    });
                }
            } catch (e) {}
            setTimeout(checkUpdates, 1000);
        });
    }).on('error', () => setTimeout(checkUpdates, 5000));
}

function handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const name = escapeHtml(msg.from.first_name || "Gamer");
    const text = msg.text || "";

    if (text.startsWith('/start')) {
        checkMembership(userId, (isJoined) => {
            if (isJoined) sendGameMenu(chatId, name, userId);
            else sendForceSubPrompt(chatId, name);
        });
        return;
    }

    if (text.startsWith('/dadu')) {
        sendSelectModeMenu(chatId, name);
        return;
    }

    if (text.startsWith('/tebakdadu') || text.startsWith('/solo')) {
        sendSoloTebakMenu(chatId, name, userId);
        return;
    }

    if (text.startsWith('/koin') || text.startsWith('/saldo')) {
        const coins = getCoins(userId);
        sendMessage(chatId, `💰 Saldo Koin <b>${name}</b>: <code>${coins.toLocaleString()} GarfCoins</code> 🪙`);
        return;
    }
}

function sendSelectModeMenu(chatId, name) {
    const text = `
🎲 <b>PILIH MODE MABAR DADU</b> 🎲
━━━━━━━━━━━━━━━━━━━━━
Host: <b>${name}</b>
Pilih sistem permainan mabar yang ingin dimainkan:
    `.trim();

    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚡️ Mode 1x Kocok (Pot Bersama Multi-Winner)", callback_data: "mode_1xkocok" }],
                [{ text: "🔥 Mode Habis-Habisan (Point Survival & Custom Bet)", callback_data: "mode_habis" }]
            ]
        }
    });
    sendRequest('/sendMessage', postData);
}

function sendSelectSlotMenu(chatId, name, mode, messageId = null) {
    const modeName = mode === '1xkocok' ? '1x Kocok (Pot Bersama)' : 'Habis-Habisan';
    const text = `
🎲 <b>BUAT ROOM MABAR [ ${modeName} ]</b> 🎲
━━━━━━━━━━━━━━━━━━━━━
Host: <b>${name}</b>
Pilih kapasitas jumlah pemain:
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: "👥 2 Pemain", callback_data: `slot_${mode}_2` },
                { text: "👥 3 Pemain", callback_data: `slot_${mode}_3` },
                { text: "👥 4 Pemain", callback_data: `slot_${mode}_4` }
            ],
            [
                { text: "👥 6 Pemain", callback_data: `slot_${mode}_6` },
                { text: "👥 7+ Pemain", callback_data: `slot_${mode}_7` }
            ]
        ]
    };

    if (messageId) {
        const postData = JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: "HTML",
            reply_markup: replyMarkup
        });
        sendRequest('/editMessageText', postData);
    } else {
        const postData = JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
            reply_markup: replyMarkup
        });
        sendRequest('/sendMessage', postData);
    }
}

function sendSoloTebakMenu(chatId, name, userId) {
    const coins = getCoins(userId);
    if (!soloGames[userId]) soloGames[userId] = { bet: 100 };
    const bet = soloGames[userId].bet;

    const text = `
🎲 <b>ARENA TEBAK DADU GARF.GAMES (SOLO)</b> 🎲
━━━━━━━━━━━━━━━━━━━━━
Player: <b>${name}</b>
Saldo: <code>${coins.toLocaleString()} GarfCoins</code> 🪙
Taruhan per lempar: <b>${bet} Koin</b>

Pilih tebakanmu di bawah ini:
• <b>Ganjil / Genap</b> (Hadiah x2)
• <b>Kecil (1-3) / Besar (4-6)</b> (Hadiah x2)
• <b>Tebak Angka Pas</b> (Hadiah x5 🔥)
    `.trim();

    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🔴 Ganjil (1,3,5)", callback_data: "solo_ganjil" },
                    { text: "🔵 Genap (2,4,6)", callback_data: "solo_genap" }
                ],
                [
                    { text: "📉 Kecil (1-3)", callback_data: "solo_kecil" },
                    { text: "📈 Besar (4-6)", callback_data: "solo_besar" }
                ],
                [
                    { text: "1️⃣", callback_data: "solo_num_1" },
                    { text: "2️⃣", callback_data: "solo_num_2" },
                    { text: "3️⃣", callback_data: "solo_num_3" }
                ],
                [
                    { text: "4️⃣", callback_data: "solo_num_4" },
                    { text: "5️⃣", callback_data: "solo_num_5" },
                    { text: "6️⃣", callback_data: "solo_num_6" }
                ],
                [
                    { text: `⚙️ Ubah Taruhan (${bet} Koin)`, callback_data: "solo_ubah_bet" }
                ]
            ]
        }
    });
    sendRequest('/sendMessage', postData);
}

function handleCallback(query) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const name = escapeHtml(query.from.first_name || "Gamer");
    const data = query.data;

    if (data === 'check_verification') {
        checkMembership(userId, (isJoined) => {
            if (isJoined) {
                answerCallbackQuery(query.id, "✨ Terverifikasi!");
                sendGameMenu(chatId, name, userId);
            } else {
                answerCallbackQuery(query.id, "⚠️ Kamu belum join @storegarf!", true);
            }
        });
        return;
    }

    if (data === 'show_guide') {
        answerCallbackQuery(query.id, "Panduan: Buat room, pemain klik Ikut Mabar sampai penuh, host atur base bet, lalu mulai game!", true);
        return;
    }

    if (data === 'open_tebak_menu') {
        answerCallbackQuery(query.id, "Membuka Arena Tebak Dadu Solo...");
        sendSoloTebakMenu(chatId, name, userId);
        return;
    }

    if (data === 'menu_buka_mabar') {
        answerCallbackQuery(query.id, "Buka pilihan mode mabar...");
        sendSelectModeMenu(chatId, name);
        return;
    }

    if (data === 'mode_1xkocok') {
        sendSelectSlotMenu(chatId, name, '1xkocok', query.message.message_id);
        answerCallbackQuery(query.id, "Mode 1x Kocok dipilih.");
        return;
    }

    if (data === 'mode_habis') {
        sendSelectSlotMenu(chatId, name, 'habis', query.message.message_id);
        answerCallbackQuery(query.id, "Mode Habis-Habisan dipilih.");
        return;
    }

    if (data.startsWith('slot_')) {
        const parts = data.replace('slot_', '').split('_');
        const mode = parts[0]; 
        const maxPlayers = parseInt(parts[1]);
        
        mabarRooms[chatId] = {
            hostId: userId,
            mode: mode,
            maxPlayers: maxPlayers,
            baseBet: 100,
            players: [],
            isOpen: true,
            messageId: query.message.message_id,
            step: 'lobby',
            round: 1
        };

        updateMabarLobbyMessage(chatId);
        answerCallbackQuery(query.id, `Room mabar ${maxPlayers} pemain dibuat! Silakan ajak teman bergabung.`);
        return;
    }

    if (data === 'join_mabar') {
        const room = mabarRooms[chatId];
        if (!room || !room.isOpen || room.step !== 'lobby') {
            answerCallbackQuery(query.id, "❌ Room sudah ditutup / tidak aktif!", true);
            return;
        }

        if (room.players.some(p => p.userId === userId)) {
            answerCallbackQuery(query.id, "⚠️ Kamu sudah terdaftar di room ini!", true);
            return;
        }

        if (room.players.length >= room.maxPlayers) {
            answerCallbackQuery(query.id, "❌ Slot room sudah penuh!", true);
            return;
        }

        room.players.push({ userId, name, choice: null, bet: 100, points: 500 });
        answerCallbackQuery(query.id, "✅ Berhasil masuk room mabar!");
        updateMabarLobbyMessage(chatId);

        // Jika slot penuh otomatis arahkan host untuk mengatur base bet atau mulai
        if (room.players.length === room.maxPlayers) {
            if (room.mode === 'habis') {
                room.step = 'setting_bet';
                sendHostSetBaseBetMenu(chatId);
            } else {
                room.step = 'voting';
                deleteMessage(chatId, room.messageId);
                sendNewMabarVotingMessage(chatId);
            }
        }
        return;
    }

    if (data === 'mabar_start_game') {
        const room = mabarRooms[chatId];
        if (!room || room.step !== 'lobby') {
            answerCallbackQuery(query.id, "❌ Game sudah dimulai atau belum di lobby!", true);
            return;
        }

        if (room.hostId !== userId) {
            answerCallbackQuery(query.id, "❌ Hanya host pembuat room yang dapat memulai!", true);
            return;
        }

        if (room.players.length < 2) {
            answerCallbackQuery(query.id, "❌ Minimal harus ada 2 pemain!", true);
            return;
        }

        if (room.mode === 'habis') {
            room.step = 'setting_bet';
            answerCallbackQuery(query.id, "⚙️ Silakan atur taruhan dasar (Base Bet) room!");
            sendHostSetBaseBetMenu(chatId);
        } else {
            room.step = 'voting';
            answerCallbackQuery(query.id, "🚀 Permainan dimulai! Pilih tebakan.");
            deleteMessage(chatId, room.messageId);
            sendNewMabarVotingMessage(chatId);
        }
        return;
    }

    // --- HOST ATUR BASE BET (50 - 500) ---
    if (data === 'host_bet_plus' || data === 'host_bet_minus') {
        const room = mabarRooms[chatId];
        if (!room || room.hostId !== userId || room.step !== 'setting_bet') {
            answerCallbackQuery(query.id, "❌ Hanya host yang dapat mengatur taruhan dasar!", true);
            return;
        }

        if (data === 'host_bet_plus') {
            room.baseBet += 50;
            if (room.baseBet > 500) room.baseBet = 500;
        } else if (data === 'host_bet_minus') {
            room.baseBet -= 50;
            if (room.baseBet < 50) room.baseBet = 50;
        }

        answerCallbackQuery(query.id, `Base Bet diatur ke ${room.baseBet} Koin`);
        sendHostSetBaseBetMenu(chatId);
        return;
    }

    if (data === 'host_confirm_bet') {
        const room = mabarRooms[chatId];
        if (!room || room.hostId !== userId || room.step !== 'setting_bet') {
            answerCallbackQuery(query.id, "❌ Aksi tidak valid!", true);
            return;
        }

        // Setel default bet semua player mengikuti baseBet host yang baru
        room.players.forEach(p => p.bet = room.baseBet);

        room.step = 'voting';
        answerCallbackQuery(query.id, "✅ Base Bet dikonfirmasi! Membuka sesi tebakan & taruhan pemain.");
        deleteMessage(chatId, room.messageId);
        sendNewHabisVotingMenu(chatId);
        return;
    }

    // --- MODE HABIS-HABISAN: PEMAIN TAMBAH/KURANG TARUHAN ---
    if (data === 'habis_bet_plus' || data === 'habis_bet_minus') {
        const room = mabarRooms[chatId];
        if (!room || room.mode !== 'habis' || room.step !== 'voting') {
            answerCallbackQuery(query.id, "❌ Sesi ubah taruhan belum aktif!", true);
            return;
        }

        const player = room.players.find(p => p.userId === userId);
        if (!player) {
            answerCallbackQuery(query.id, "❌ Kamu bukan peserta di room ini!", true);
            return;
        }

        if (data === 'habis_bet_plus') player.bet += 50;
        else if (data === 'habis_bet_minus') {
            player.bet -= 50;
            if (player.bet < room.baseBet) player.bet = room.baseBet;
        }

        if (getCoins(userId) < player.bet) {
            player.bet -= 50;
            answerCallbackQuery(query.id, "❌ Saldo koin kamu tidak mencukupi untuk menaikkan taruhan!", true);
            return;
        }

        answerCallbackQuery(query.id, `Taruhanmu diatur ke ${player.bet} Koin`);
        updateHabisVotingMessage(chatId);
        return;
    }

    // --- PILIHAN TEBAKAN ---
    if (data.startsWith('mabar_vote_') || data.startsWith('mabar_num_') || data.startsWith('habis_vote_') || data.startsWith('habis_num_')) {
        const room = mabarRooms[chatId];
        if (!room || room.step !== 'voting') {
            answerCallbackQuery(query.id, "❌ Sesi pemilihan belum dibuka!", true);
            return;
        }

        const player = room.players.find(p => p.userId === userId);
        if (!player) {
            answerCallbackQuery(query.id, "❌ Kamu bukan peserta di room ini!", true);
            return;
        }

        if (room.mode === 'habis' && getCoins(userId) < player.bet) {
            answerCallbackQuery(query.id, `❌ Saldo koin kurang! Taruhanmu ${player.bet} koin.`, true);
            return;
        }

        let cleanData = data.replace('habis_', 'mabar_');
        let choiceKey = "";
        let choiceDesc = "";

        if (cleanData === 'mabar_vote_ganjil') { choiceKey = 'ganjil'; choiceDesc = "Ganjil (1,3,5)"; }
        else if (cleanData === 'mabar_vote_genap') { choiceKey = 'genap'; choiceDesc = "Genap (2,4,6)"; }
        else if (cleanData === 'mabar_vote_kecil') { choiceKey = 'kecil'; choiceDesc = "Kecil (1-3)"; }
        else if (cleanData === 'mabar_vote_besar') { choiceKey = 'besar'; choiceDesc = "Besar (4-6)"; }
        else if (cleanData.startsWith('mabar_num_')) {
            const num = cleanData.replace('mabar_num_', '');
            choiceKey = `num_${num}`;
            choiceDesc = `Angka Pas [${num}]`;
        }

        player.choice = choiceKey;
        answerCallbackQuery(query.id, `✅ Pilihan ${choiceDesc} disimpan!`);
        
        if (room.mode === 'habis') updateHabisVotingMessage(chatId);
        else updateMabarVotingMessage(chatId);
        return;
    }

    if (data === 'mabar_roll_action') {
        const room = mabarRooms[chatId];
        if (!room || room.step !== 'voting') {
            answerCallbackQuery(query.id, "❌ Sesi belum aktif!", true);
            return;
        }

        const unvoted = room.players.filter(p => !p.choice);
        if (unvoted.length > 0) {
            answerCallbackQuery(query.id, `⚠️ Masih ada pemain yang belum memilih tebakan!`, true);
            return;
        }

        answerCallbackQuery(query.id, "🎲 Mengocok dadu mabar...");
        deleteMessage(chatId, room.messageId);
        if (room.mode === 'habis') executeRollHabis(chatId);
        else executeRollMabar(chatId);
        return;
    }

    // --- SOLO TEBAK DADU FLOW ---
    if (data === 'solo_ubah_bet') {
        if (!soloGames[userId]) soloGames[userId] = { bet: 100 };
        let current = soloGames[userId].bet;
        let next = current === 100 ? 250 : current === 250 ? 500 : current === 500 ? 1000 : 100;
        soloGames[userId].bet = next;
        
        answerCallbackQuery(query.id, `Taruhan diubah ke ${next} Koin`);
        
        const text = `
🎲 <b>ARENA TEBAK DADU GARF.GAMES (SOLO)</b> 🎲
━━━━━━━━━━━━━━━━━━━━━
Player: <b>${name}</b>
Saldo: <code>${getCoins(userId).toLocaleString()} GarfCoins</code> 🪙
Taruhan per lempar: <b>${next} Koin</b>

Pilih tebakanmu di bawah ini:
• <b>Ganjil / Genap</b> (Hadiah x2)
• <b>Kecil (1-3) / Besar (4-6)</b> (Hadiah x2)
• <b>Tebak Angka Pas</b> (Hadiah x5 🔥)
        `.trim();

        const postData = JSON.stringify({
            chat_id: chatId,
            message_id: query.message.message_id,
            text: text,
            parse_mode: "HTML",
            reply_markup: query.message.reply_markup
        });
        sendRequest('/editMessageText', postData);
        return;
    }

    if (data.startsWith('solo_')) {
        if (!soloGames[userId]) soloGames[userId] = { bet: 100 };
        let betAmount = soloGames[userId].bet;

        if (getCoins(userId) < betAmount) {
            answerCallbackQuery(query.id, `❌ Saldo kurang! Butuh ${betAmount} koin.`, true);
            return;
        }

        userCoins[userId] -= betAmount;
        answerCallbackQuery(query.id, "🎲 Dadu dikocok...");

        sendTelegramDice(chatId, (diceValue) => {
            setTimeout(() => {
                const rolled = diceValue;
                let isWin = false;
                let multiplier = 2;
                let choiceDesc = "";

                if (data === 'solo_ganjil') {
                    choiceDesc = "Ganjil (1, 3, 5)";
                    isWin = (rolled % 2 !== 0);
                } else if (data === 'solo_genap') {
                    choiceDesc = "Genap (2, 4, 6)";
                    isWin = (rolled % 2 === 0);
                } else if (data === 'solo_kecil') {
                    choiceDesc = "Kecil (1 - 3)";
                    isWin = (rolled >= 1 && rolled <= 3);
                } else if (data === 'solo_besar') {
                    choiceDesc = "Besar (4 - 6)";
                    isWin = (rolled >= 4 && rolled <= 6);
                } else if (data.startsWith('solo_num_')) {
                    const num = parseInt(data.replace('solo_num_', ''));
                    choiceDesc = `Angka Pas [ ${num} ]`;
                    multiplier = 5;
                    isWin = (rolled === num);
                }

                let payout = 0;
                let resText = `🎲 <b>HASIL TEBAK DADU SOLO</b> 🎲\n━━━━━━━━━━━━━━━━━━━━━\n`;
                resText += `Player: <b>${name}</b>\n`;
                resText += `Tebakan: <b>${choiceDesc}</b>\n`;
                resText += `Hasil Dadu: <b>[ ${rolled} ]</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;

                if (isWin) {
                    payout = betAmount * multiplier;
                    userCoins[userId] += payout;
                    resText += `🎉 <b>MENANG!</b> Tebakan tepat!\nHadiah: <b>+${payout} GarfCoins</b> 🪙`;
                } else {
                    resText += `❌ <b>KALAH!</b> Beruntung lain kali.\nTaruhan <b>-${betAmount} Koin</b> hangus.`;
                }

                resText += `\n\nSaldo Sekarang: <code>${getCoins(userId).toLocaleString()} GarfCoins</code>`;
                sendMessage(chatId, resText);
            }, 3500);
        });
        return;
    }
}

// --- MABAR UI & LOBBY ---
function buildMabarLobbyText(chatId) {
    const room = mabarRooms[chatId];
    let listName = room.players.length === 0 ? "<i>Belum ada pemain...</i>" : room.players.map((p, idx) => `${idx + 1}. <b>${p.name}</b> ✅`).join("\n");
    let modeLabel = room.mode === '1xkocok' ? '1x Kocok (Pot Bersama)' : 'Habis-Habisan';

    return `
🎲 <b>LOBBY MABAR [ ${modeLabel} ]</b> (${room.players.length}/${room.maxPlayers}) 🎲
━━━━━━━━━━━━━━━━━━━━━
👥 <b>Daftar Pemain:</b>
${listName}
━━━━━━━━━━━━━━━━━━━━━
<i>Room terbuka! Pemain silakan klik tombol gabung di bawah. Host dapat menekan tombol "Mulai Mabar" jika sudah siap.</i>
    `.trim();
}

function updateMabarLobbyMessage(chatId) {
    const room = mabarRooms[chatId];
    if (!room || !room.messageId) return;

    const postData = JSON.stringify({
        chat_id: chatId,
        message_id: room.messageId,
        text: buildMabarLobbyText(chatId),
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: `🟢 Ikut Mabar (${room.players.length}/${room.maxPlayers})`, callback_data: "join_mabar" }],
                [{ text: "🚀 Mulai Mabar", callback_data: "mabar_start_game" }]
            ]
        }
    });
    sendRequest('/editMessageText', postData);
}

function sendHostSetBaseBetMenu(chatId) {
    const room = mabarRooms[chatId];
    if (!room) return;

    const text = `
⚙️ <b>ATUR TARUHAN DASAR (BASE BET) ROOM</b> ⚙️
━━━━━━━━━━━━━━━━━━━━━
Host silakan tentukan taruhan dasar (50 - 500 Koin) untuk ronde mabar Habis-Habisan:
💰 <b>Base Bet:</b> <code>${room.baseBet} Koin</code>
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: "➖ Kurang (-50)", callback_data: "host_bet_minus" },
                { text: "➕ Tambah (+50)", callback_data: "host_bet_plus" }
            ],
            [
                { text: `✅ Konfirmasi Taruhan (${room.baseBet} Koin)`, callback_data: "host_confirm_bet" }
            ]
        ]
    };

    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: replyMarkup
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result) {
                    room.messageId = response.result.message_id;
                }
            } catch (e) {}
        });
    });
    req.on('error', e => {});
    req.write(postData);
    req.end();
}

function sendNewMabarVotingMessage(chatId) {
    const room = mabarRooms[chatId];
    if (!room) return;

    const text = buildMabarVotingText(chatId);
    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🔴 Ganjil (1,3,5)", callback_data: "mabar_vote_ganjil" },
                    { text: "🔵 Genap (2,4,6)", callback_data: "mabar_vote_genap" }
                ],
                [
                    { text: "📉 Kecil (1-3)", callback_data: "mabar_vote_kecil" },
                    { text: "📈 Besar (4-6)", callback_data: "mabar_vote_besar" }
                ],
                [
                    { text: "1️⃣", callback_data: "mabar_num_1" },
                    { text: "2️⃣", callback_data: "mabar_num_2" },
                    { text: "3️⃣", callback_data: "mabar_num_3" }
                ],
                [
                    { text: "4️⃣", callback_data: "mabar_num_4" },
                    { text: "5️⃣", callback_data: "mabar_num_5" },
                    { text: "6️⃣", callback_data: "mabar_num_6" }
                ],
                [
                    { text: "🎲 KOCOK DADU SEKARANG!", callback_data: "mabar_roll_action" }
                ]
            ]
        }
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result) {
                    room.messageId = response.result.message_id;
                }
            } catch (e) {}
        });
    });
    req.on('error', e => {});
    req.write(postData);
    req.end();
}

function sendNewHabisVotingMenu(chatId) {
    const room = mabarRooms[chatId];
    if (!room) return;

    const text = buildHabisVotingText(chatId);
    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "➖ Kurang Bet", callback_data: "habis_bet_minus" },
                    { text: "➕ Tambah Bet", callback_data: "habis_bet_plus" }
                ],
                [
                    { text: "🔴 Ganjil (1,3,5)", callback_data: "habis_vote_ganjil" },
                    { text: "🔵 Genap (2,4,6)", callback_data: "habis_vote_genap" }
                ],
                [
                    { text: "📉 Kecil (1-3)", callback_data: "habis_vote_kecil" },
                    { text: "📈 Besar (4-6)", callback_data: "habis_vote_besar" }
                ],
                [
                    { text: "1️⃣", callback_data: "habis_num_1" },
                    { text: "2️⃣", callback_data: "habis_num_2" },
                    { text: "3️⃣", callback_data: "habis_num_3" }
                ],
                [
                    { text: "4️⃣", callback_data: "habis_num_4" },
                    { text: "5️⃣", callback_data: "habis_num_5" },
                    { text: "6️⃣", callback_data: "habis_num_6" }
                ],
                [
                    { text: "🎲 KOCOK DADU SEKARANG!", callback_data: "mabar_roll_action" }
                ]
            ]
        }
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result) {
                    room.messageId = response.result.message_id;
                }
            } catch (e) {}
        });
    });
    req.on('error', e => {});
    req.write(postData);
    req.end();
}

function buildMabarVotingText(chatId) {
    const room = mabarRooms[chatId];
    let statusList = room.players.map(p => {
        let displayChoice = "Belum Pilih";
        if (p.choice) {
            if (p.choice.startsWith('num_')) displayChoice = `Angka Pas [${p.choice.replace('num_', '')}]`;
            else displayChoice = p.choice.toUpperCase();
        }
        let statusIcon = p.choice ? `✅ <b>(${displayChoice})</b>` : `⏳ <i>Memilih tebakan...</i>`;
        return `• <b>${p.name}</b>: ${statusIcon}`;
    }).join("\n");

    let roundInfo = room.round > 1 ? `\n🔄 <b>Putaran ke-${room.round} (Re-Roll Seri)</b>` : "";

    return `
🎲 <b>ARENA TEBAK DADU MABAR [ Mode 1x Kocok ]</b> 🎲${roundInfo}
━━━━━━━━━━━━━━━━━━━━━
Setiap peserta wajib memilih tebakan di bawah ini:

${statusList}
━━━━━━━━━━━━━━━━━━━━━
<i>Klik tombol "KOCOK DADU SEKARANG!" jika semua pemain sudah memilih!</i>
    `.trim();
}

function buildHabisVotingText(chatId) {
    const room = mabarRooms[chatId];
    let statusList = room.players.map(p => {
        let displayChoice = "Belum Pilih";
        if (p.choice) {
            if (p.choice.startsWith('num_')) displayChoice = `Angka Pas [${p.choice.replace('num_', '')}]`;
            else displayChoice = p.choice.toUpperCase();
        }
        let statusIcon = p.choice ? `✅ <b>(${displayChoice} | Bet: ${p.bet} Koin)</b>` : `⏳ <i>Atur Taruhan & Pilih Tebakan...</i>`;
        return `• <b>${p.name}</b>: ${statusIcon} | Poin: <code>${p.points}</code>`;
    }).join("\n");

    return `
🔥 <b>ARENA TEBAK DADU MABAR [ Mode Habis-Habisan - Ronde ${room.round} ]</b> 🔥
━━━━━━━━━━━━━━━━━━━━━
Dashboard Taruhan & Poin Pemain:
${statusList}
━━━━━━━━━━━━━━━━━━━━━
<i>Gunakan tombol ubah taruhan (Bet) di bawah lalu klik Kocok Dadu!</i>
    `.trim();
}

function updateHabisVotingMessage(chatId) {
    const room = mabarRooms[chatId];
    if (!room || !room.messageId) return;

    const postData = JSON.stringify({
        chat_id: chatId,
        message_id: room.messageId,
        text: buildHabisVotingText(chatId),
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "➖ Kurang Bet", callback_data: "habis_bet_minus" },
                    { text: "➕ Tambah Bet", callback_data: "habis_bet_plus" }
                ],
                [
                    { text: "🔴 Ganjil (1,3,5)", callback_data: "habis_vote_ganjil" },
                    { text: "🔵 Genap (2,4,6)", callback_data: "habis_vote_genap" }
                ],
                [
                    { text: "📉 Kecil (1-3)", callback_data: "habis_vote_kecil" },
                    { text: "📈 Besar (4-6)", callback_data: "habis_vote_besar" }
                ],
                [
                    { text: "1️⃣", callback_data: "habis_num_1" },
                    { text: "2️⃣", callback_data: "habis_num_2" },
                    { text: "3️⃣", callback_data: "habis_num_3" }
                ],
                [
                    { text: "4️⃣", callback_data: "habis_num_4" },
                    { text: "5️⃣", callback_data: "habis_num_5" },
                    { text: "6️⃣", callback_data: "habis_num_6" }
                ],
                [
                    { text: "🎲 KOCOK DADU SEKARANG!", callback_data: "mabar_roll_action" }
                ]
            ]
        }
    });
    sendRequest('/editMessageText', postData);
}

function executeRollMabar(chatId) {
    const room = mabarRooms[chatId];
    if (!room) return;
    room.isOpen = false;

    if (room.round === 1) {
        room.players.forEach(p => {
            userCoins[p.userId] -= room.betAmount;
        });
    }

    sendMessage(chatId, `🚀 <b>MENGECOK DADU MABAR (Putaran ${room.round})...</b>`);

    sendTelegramDice(chatId, (diceValue) => {
        setTimeout(() => {
            const rolled = diceValue;
            let results = room.players.map(p => {
                let choice = p.choice;
                let isWin = false;
                let desc = "";

                if (choice === 'ganjil') { desc = "Ganjil"; isWin = (rolled % 2 !== 0); }
                else if (choice === 'genap') { desc = "Genap"; isWin = (rolled % 2 === 0); }
                else if (choice === 'kecil') { desc = "Kecil (1-3)"; isWin = (rolled >= 1 && rolled <= 3); }
                else if (choice === 'besar') { desc = "Besar (4-6)"; isWin = (rolled >= 4 && rolled <= 6); }
                else if (choice && choice.startsWith('num_')) {
                    let num = parseInt(choice.replace('num_', ''));
                    desc = `Angka Pas [${num}]`;
                    isWin = (rolled === num);
                }
                return { name: p.name, userId: p.userId, desc, isWin, bet: room.betAmount };
            });

            const totalPool = room.players.length * room.betAmount * room.round;
            const winners = results.filter(r => r.isWin);

            let leaderboardText = `🏆 <b>HASIL MABAR [ 1X KOCOK - R. ${room.round} ]</b> 🏆\n━━━━━━━━━━━━━━━━━━━━━\n`;
            leaderboardText += `Hasil Dadu Keluar: <b>[ ${rolled} ]</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;

            results.forEach(r => {
                let badge = r.isWin ? "✅ (BENAR)" : "❌ (SALAH)";
                leaderboardText += `• <b>${r.name}</b> (${r.desc}) — ${badge}\n`;
            });

            leaderboardText += `━━━━━━━━━━━━━━━━━━━━━\n`;

            if (winners.length === 0 || winners.length === room.players.length) {
                leaderboardText += `🤝 <b>SERI / DRAW!</b> Tidak ada pemenang atau semua tebakan sama.\n\n<i>🔄 Mengocok ulang dadu secara otomatis...</i>`;
                sendMessage(chatId, leaderboardText);

                room.round++;
                room.players.forEach(p => p.choice = null);
                room.isOpen = true;
                setTimeout(() => {
                    room.step = 'voting';
                    sendNewMabarVotingMessage(chatId);
                }, 3000);
                return;
            }

            const prizePerWinner = Math.floor(totalPool / winners.length);
            const winnerNames = winners.map(w => {
                userCoins[w.userId] += prizePerWinner;
                return w.name;
            }).join(", ");

            leaderboardText += `🎉 <b>PEMENANG (${winners.length} Orang):</b> <b>${winnerNames}</b> masing-masing mendapat <b>+${prizePerWinner} GarfCoins!</b> 🪙`;

            sendMessage(chatId, leaderboardText);
            delete mabarRooms[chatId];
        }, 3500);
    });
}

function executeRollHabis(chatId) {
    const room = mabarRooms[chatId];
    if (!room) return;
    room.isOpen = false;

    room.players.forEach(p => {
        userCoins[p.userId] -= p.bet;
    });

    sendMessage(chatId, `🔥 <b>MENGECOK DADU MABAR HABIS-HABISAN (Ronde ${room.round})...</b>`);

    sendTelegramDice(chatId, (diceValue) => {
        setTimeout(() => {
            const rolled = diceValue;
            
            let text = `⚔️ <b>HASIL RONDE MABAR HABIS-HABISAN</b> ⚔️\n━━━━━━━━━━━━━━━━━━━━━\n`;
            text += `Hasil Dadu Keluar: <b>[ ${rolled} ]</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;

            room.players.forEach(p => {
                let choice = p.choice;
                let isWin = false;
                let desc = "";

                if (choice === 'ganjil') { isWin = (rolled % 2 !== 0); desc = "Ganjil"; }
                else if (choice === 'genap') { isWin = (rolled % 2 === 0); desc = "Genap"; }
                else if (choice === 'kecil') { isWin = (rolled >= 1 && rolled <= 3); desc = "Kecil"; }
                else if (choice === 'besar') { isWin = (rolled >= 4 && rolled <= 6); desc = "Besar"; }
                else if (choice && choice.startsWith('num_')) {
                    let num = parseInt(choice.replace('num_', ''));
                    isWin = (rolled === num);
                    desc = `Angka Pas [${num}]`;
                }

                if (isWin) {
                    let multiplier = choice && choice.startsWith('num_') ? 5 : 2;
                    let reward = p.bet * multiplier;
                    userCoins[p.userId] += reward;
                    let netProfit = reward - p.bet;
                    p.points += netProfit;
                    text += `• <b>${p.name}</b> (${desc} | Bet: ${p.bet}) — ✅ <b>MENANG (+${netProfit} Poin)</b>\n`;
                } else {
                    p.points -= p.bet;
                    if (p.points < 0) p.points = 0;
                    text += `• <b>${p.name}</b> (${desc} | Bet: ${p.bet}) — ❌ <b>KALAH (-${p.bet} Poin)</b>\n`;
                }
            });

            room.players.sort((a, b) => b.points - a.points);
            let champion = room.players[0];

            text += `━━━━━━━━━━━━━━━━━━━━━\n👑 <b>PEMIMPIN SEMENTARA:</b> <b>${champion.name}</b> (${champion.points} Poin)`;

            let survivingPlayers = room.players.filter(p => p.points > 0);

            if (survivingPlayers.length <= 1 || room.round >= 10) {
                let winner = survivingPlayers[0] || champion;
                text += `\n\n🏆 <b>GAME SELESAI!</b>\n👑 <b>JUARA UTAMA:</b> <b>${winner.name}</b> bertahan hidup dengan total poin tertinggi <b>(${winner.points} Poin)!</b> 🪙🎉`;
                sendMessage(chatId, text);
                delete mabarRooms[chatId];
            } else {
                text += `\n\n<i>🔄 Melanjutkan ke Ronde ${room.round + 1} otomatis dalam 3 detik...</i>`;
                sendMessage(chatId, text);

                room.round++;
                room.players.forEach(p => { 
                    p.choice = null; 
                    if(p.bet > getCoins(p.userId)) p.bet = room.baseBet; 
                });
                room.isOpen = true;
                setTimeout(() => {
                    room.step = 'voting';
                    sendNewHabisVotingMenu(chatId);
                }, 3000);
            }
        }, 3500);
    });
}

function deleteMessage(chatId, messageId) {
    if (!messageId) return;
    const postData = JSON.stringify({ chat_id: chatId, message_id: messageId });
    sendRequest('/deleteMessage', postData);
}

function sendTelegramDice(chatId, callback) {
    const postData = JSON.stringify({ chat_id: chatId, emoji: "🎲" });
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}/sendDice`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result && response.result.dice) {
                    const diceValue = response.result.dice.value;
                    callback(diceValue);
                    return;
                }
            } catch (e) {}
            callback(Math.floor(Math.random() * 6) + 1);
        });
    });
    req.on('error', e => callback(Math.floor(Math.random() * 6) + 1));
    req.write(postData);
    req.end();
}

function sendForceSubPrompt(chatId, name) {
    const postData = JSON.stringify({
        chat_id: chatId,
        text: `<b>⚡️ GARF.GAMES — ACCESS GATEWAY ⚡️</b>\nHalo <b>${name}</b>, wajib join @storegarf dulu!`,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📢 Masuk Channel @storegarf", url: CHANNEL_LINK }],
                [{ text: "⚡️ Verifikasi Keanggotaan", callback_data: "check_verification" }]
            ]
        }
    });
    sendRequest('/sendMessage', postData);
}

function sendGameMenu(chatId, name, userId) {
    const coins = getCoins(userId);
    const text = `
👑 <b>WELCOME TO GARF.GAMES LOUNGE</b>
━━━━━━━━━━━━━━━━━━━━━
Status: <b>VERIFIED MEMBER</b> ✅
Player: <b>${name}</b>
Saldo Koin: <code>${coins.toLocaleString()} GarfCoins</code> ✅

Nikmati platform casual tabletop mabar langsung di dalam Telegram tanpa instalasi aplikasi tambahan:

🎲 <b>LUDO & TABLETOP KIT</b>
• Room Multiplayer Real-Time
• Ludo Classic, UNO & Monopoly
• Auto-Fill Bot AI System

📊 <b>SAMBUNG KATA KBBI</b>
• Validasi Kata Resmi GenCipta
• Real-time Word Chain Battle
• Turn-based Multiplayer Engine
━━━━━━━━━━━━━━━━━━━━━
<i>Pilih arena permainan di bawah ini:</i>
    `.trim();

    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎲 Buka Arena Tebak Dadu (Solo)", callback_data: "open_tebak_menu" }],
                [{ text: "👥 Buka Meja Mabar Dadu (/dadu)", callback_data: "menu_buka_mabar" }],
                [{ text: "📖 Panduan & Cara Main Dadu", callback_data: "show_guide" }],
                [{ text: "🎮 Launch Ludo & Tabletop", url: "https://t.me/garfludoBot/play" }],
                [{ text: "🔤 Launch Sambung Kata KBBI", url: "https://t.me/garfludoBot/kata" }],
                [{ text: "📢 Official Channel Store", url: CHANNEL_LINK }]
            ]
        }
    });
    sendRequest('/sendMessage', postData);
}

function sendMessage(chatId, text) {
    const postData = JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" });
    sendRequest('/sendMessage', postData);
}

function answerCallbackQuery(queryId, text, showAlert = false) {
    const postData = JSON.stringify({ callback_query_id: queryId, text: text, show_alert: showAlert });
    sendRequest('/answerCallbackQuery', postData);
}

function sendRequest(endpoint, postData) {
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}${endpoint}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, res => res.on('data', () => {}));
    req.on('error', e => {});
    req.write(postData);
    req.end();
}

function escapeHtml(string) {
    return String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

checkUpdates();
