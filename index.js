require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('Erro: O token do bot do Telegram não foi encontrado. Certifique-se de que a variável de ambiente TELEGRAM_BOT_TOKEN está configurada.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const userExpenses = {};

console.log('Bot do Telegram iniciado e aguardando comandos...');

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Olá! Eu sou seu bot de controle de gastos. Para registrar um novo gasto, digite /gasto.');
});

bot.onText(/\/gasto/, (msg) => {
    const chatId = msg.chat.id;
    userExpenses[chatId] = {
        state: 'waiting_description',
        description: '',
        category: '',
        value: 0
    };
    bot.sendMessage(chatId, 'Certo! Qual a **descrição** do gasto? (Ex: Almoço no restaurante)', { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith('/')) {
        return;
    }

    if (userExpenses[chatId]) {
        switch (userExpenses[chatId].state) {
            case 'waiting_description':
                userExpenses[chatId].description = text;
                userExpenses[chatId].state = 'waiting_category';
                await bot.sendMessage(chatId, `Ok, a descrição é "${text}". Agora, qual a **categoria**? (Ex: Alimentação, Transporte, Lazer)`, { parse_mode: 'Markdown' });
                break;

            case 'waiting_category':
                userExpenses[chatId].category = text;
                userExpenses[chatId].state = 'waiting_value';
                await bot.sendMessage(chatId, `Entendido, a categoria é "${text}". Por último, qual o **valor** do gasto? (Use ponto para decimais, Ex: 50.75)`, { parse_mode: 'Markdown' });
                break;

            case 'waiting_value':
                const value = parseFloat(text.replace(',', '.')); 

                if (isNaN(value) || value <= 0) {
                    await bot.sendMessage(chatId, 'Valor inválido. Por favor, digite um número positivo para o valor do gasto. (Ex: 50.75)');
                    return; 
                }

                userExpenses[chatId].value = value;
                userExpenses[chatId].state = 'completed';

                const expenseData = {
                    description: userExpenses[chatId].description,
                    category: userExpenses[chatId].category,
                    value: userExpenses[chatId].value,
                    date: new Date().toISOString()
                };

                await bot.sendMessage(chatId, `Perfeito! Registrando o gasto:
Descrição: *${expenseData.description}*
Categoria: *${expenseData.category}*
Valor: *R$ ${expenseData.value.toFixed(2)}*`, { parse_mode: 'Markdown' });

                try {
                    const API_URL = process.env.API_URL || 'http://localhost:3000/expenses'; 

                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(expenseData)
                    });

                    if (response.ok) {
                        await bot.sendMessage(chatId, 'Gasto enviado para a API com sucesso! ✅');
                    } else {
                        const errorText = await response.text();
                        await bot.sendMessage(chatId, `Erro ao enviar gasto para a API: ${response.status} - ${errorText} 🔴`);
                        console.error('Erro ao enviar gasto para a API:', response.status, errorText);
                    }
                } catch (error) {
                    await bot.sendMessage(chatId, `Ocorreu um erro ao tentar conectar com a API. Por favor, tente novamente mais tarde. ❌`);
                    console.error('Erro na requisição para a API:', error);
                } finally {
                    delete userExpenses[chatId];
                }
                break;

            default:
                break;
        }
    }
});

bot.on('polling_error', (error) => {
    console.error('Erro de polling do Telegram:', error);
});

