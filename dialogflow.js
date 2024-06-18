const functions = require('firebase-functions');
const { WebhookClient, Suggestion } = require('dialogflow-fulfillment');
const { google } = require('googleapis');
const express = require('express');
const cors = require('cors');
var nodemailer = require("nodemailer");
require('dotenv').config();
const tls = require('tls');

require('events').EventEmitter.defaultMaxListeners = 25; 

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

const sheets = google.sheets('v4');
const serviceAccount = "{}"  // Add your service account key in One line, without inverted commas means place object

const client = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key.replace(/\\n/g, '\n'),
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
    ]
});

const PORT = process.env.PORT || 3000;


const { GoogleGenerativeAI } = require("@google/generative-ai");
const MODEL_NAME = "gemini-1.5-pro";
const API_KEY = process.env.API_KEY;

async function runChat(queryText) {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
        temperature: 1,
        topK: 0,
        topP: 0.95,
        maxOutputTokens: 50,
    };

    const chat = model.startChat({
        generationConfig,
        history: [],
    });

    const result = await chat.sendMessage(queryText);
    return result.response.text();
}

tls.TLSSocket.prototype.setMaxListeners(20); 


app.post("/webhook", async (req, res) => {
    const agent = new WebhookClient({ request: req, response: res });

    function selectCow(agent) {
        const { cowType, age, budget, address } = agent.parameters;

        agent.context.set({
            name: 'selectcow-followup',
            lifespan: 2,
            parameters: { cowType, age: age.amount, budget, address }
        });

        agent.add(`You've selected a ${cowType} aged ${age.amount} years with a budget of ${budget}. Can you please confirm the delivery address: ${address}?`);
    }

    async function selectCowYes(agent) {
        const context = agent.context.get('selectcow-followup');
        if (!context) {
            agent.add('Sorry, I lost the context. Can you please repeat your selection?');
            return;
        }


        const { cowType, age, budget, address, person, number, email } = context.parameters;

        try {
            await sheets.spreadsheets.values.append({
                auth: client,
                spreadsheetId: process.env.SHEET_ID,
                range: 'Sheet1!A:G',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[`${cowType}`, `${age} Yr`, `Rs ${budget}`, `${address}`, `${person.name}`, `${number}`, `${email}`]]
                }
            });

        } catch (error) {
            console.error('Error adding reservation to Google Sheets:', error);
            agent.add(`I'm sorry, I'm not able to take down your reservation but you'll be connected to the main line in a moment.`);
            agent.setFollowupEvent('call_transfer_event');
        }




        var transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "muddussir1247@gmail.com",
                pass: process.env.EMAIL_PASS,
            },
        });
        transporter.setMaxListeners(25); 

        var maillist = [email];
        var mailOptions = {
            from: "muddussir1247@gmail.com",
            to: maillist,
            subject: "Cow Order Confirmation",
            html: `<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); padding: 20px;">
    <div style="max-width: 600px; margin: auto; padding: 20px; border-radius: 15px; background: rgba(255, 255, 255, 0.55); box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.18);">
        <h2 style="color: #4CAF50; text-align: center;">Order Confirmation</h2>
        <p>Dear ${person.name},</p>
        <p>Thank you for your order! Here are the details of your selection:</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: rgba(255, 255, 255, 0.4); border-radius: 10px; overflow: hidden;">
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">Cow Type:</td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">${cowType}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">Age:</td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">${age} years</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">Budget:</td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">${budget}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">Delivery Address:</td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">${address}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">Phone:</td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.1);">${number}</td>
            </tr>
            <tr>
                <td style="padding: 10px;">Email:</td>
                <td style="padding: 10px;">${email}</td>
            </tr>
        </table>
        <p>If you have any questions or need further assistance, please do not hesitate to contact us.</p>
        <p>Best regards,</p>
        <p>MUHAMMAD MUDDUSSIR RAZA</p>
    </div>
</body>`,
            text: `Order Details:\nName: ${person.name}\nEmail: ${email}\nPhone: ${number}\nAddress: ${address}\nCow Type: ${cowType}\nAge: ${age}\nBudget: ${budget}`
        };

        transporter.sendMail(mailOptions, function (error, info) {
            if (error) console.log(error);
            else console.log("Email sent: " + info.response);
        });
        agent.add(`Thank you for confirming! An email will be sent shortly.`);
    }


    async function fallback() {
        let action = req.body.queryResult.action;
        let queryText = req.body.queryResult.queryText;

        let result = '';
        if (action === 'input.unknown') {
            result = await runChat(queryText);
        }

        agent.add(result);
        console.log(result);
    }

    let intentMap = new Map();
    intentMap.set('fallback', fallback);
    intentMap.set('select-cow', selectCow);
    intentMap.set('select-cow - yes', selectCowYes);
    agent.handleRequest(intentMap);
});

// Firebase Cloud Function
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);

// Express server listen
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
