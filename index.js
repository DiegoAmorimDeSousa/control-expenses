require('dotenv').config(); 
const TelegramBot = require('node-telegram-bot-api');
const express = require('express'); 

const token = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.API_URL; 
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const PORT = process.env.PORT || 80;

if (!token) {
    console.error('Erro: O token do bot do Telegram não foi encontrado. Certifique-se de que a variável de ambiente TELEGRAM_BOT_TOKEN está configurada.');
    process.exit(1);
}

if (!API_URL) {
    console.error('Erro: A URL da API de gastos não foi configurada na variável de ambiente API_URL.');
    process.exit(1);
}

if (!WEBHOOK_URL) {
    console.error('Erro: A URL do Webhook do bot não foi configurada na variável de ambiente WEBHOOK_URL. Esta deve ser a URL pública do seu bot no Render.');
    process.exit(1);
}

const bot = new TelegramBot(token);

const app = express();
app.use(express.json()); 

bot.setWebhook(`${WEBHOOK_URL}/webhook`).then(() => {
    console.log(`Webhook configurado para: ${WEBHOOK_URL}/webhook`);
}).catch(err => {
    console.error('Erro ao configurar o webhook:', err);
});

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200); 
});

const userExpenses = {};

console.log('Bot do Telegram iniciado e aguardando comandos via webhook...');

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from.first_name || 'Usuário Desconhecido';
    bot.sendMessage(chatId, `Olá ${user}! Eu sou seu bot de controle de gastos. Para registrar um novo gasto, digite /gasto.`);
});

bot.onText(/\/gasto/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from.first_name || 'Usuário Desconhecido';
    userExpenses[chatId] = {
        state: 'waiting_description',
        description: '',
        category: '',
        value: 0,
        user: user
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
                    date: new Date().toISOString(),
                    user: userExpenses[chatId].user
                };

                await bot.sendMessage(chatId, `Perfeito! Registrando o gasto:
Descrição: *${expenseData.description}*
Categoria: *${expenseData.category}*
Valor: *R$ ${expenseData.value.toFixed(2)}*
Registrado por: *${expenseData.user}*`, { parse_mode: 'Markdown' });

                try {
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

app.listen(PORT, () => {
    console.log(`Servidor do bot escutando na porta ${PORT}`);
    console.log(`Aguardando webhooks em ${WEBHOOK_URL}/webhook`);
});

bot.on('polling_error', (error) => { 
    console.error('Erro geral do bot (não relacionado a webhook, se polling estiver desabilitado):', error);
});
