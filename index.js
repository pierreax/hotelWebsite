const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

// Access environment variables directly from process.env
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;
const EMAIL_CLIENT_ID = process.env.EMAIL_CLIENT_ID;
const EMAIL_CLIENT_SECRET = process.env.EMAIL_CLIENT_SECRET;
const EMAIL_TENANT_ID = process.env.EMAIL_TENANT_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Middleware to parse JSON requests
app.use(express.json());

// Serve static files from the root directory (e.g., for your HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Send index.html file for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API to get the Amadeus access token
app.get('/api/getAccessToken', async (req, res) => {
    try {
        const response = await fetch('https://api.amadeus.com/v1/security/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: AMADEUS_API_KEY,
                client_secret: AMADEUS_API_SECRET
            })
        });

        const data = await response.json();
        const accessToken = data.access_token;
        const expiresIn = data.expires_in;

        // Send the access token and expiration to the frontend
        res.json({ access_token: accessToken, expires_in: expiresIn });
    } catch (error) {
        console.error('Error fetching access token:', error.message);
        res.status(500).json({ error: 'Failed to fetch access token' });
    }
});

// API to get hotel offers from Amadeus
app.get('/api/getHotelOffers', async (req, res) => {
    const { hotelIds, adults, checkInDate, checkOutDate, roomQuantity } = req.query;
    try {
        const response = await fetch('https://api.amadeus.com/v1/shopping/hotel-offers', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${req.headers.authorization}`  // Pass the access token here
            },
            params: {
                hotelIds: hotelIds,
                adults: adults,
                checkInDate: checkInDate,
                checkOutDate: checkOutDate,
                roomQuantity: roomQuantity,
                paymentPolicy: 'NONE',
                bestRateOnly: true,
                includeClosed: false
            }
        });

        const data = await response.json();
        res.json(data);  // Send back the fetched hotel offers data
    } catch (error) {
        console.error('Error fetching hotel offers:', error.message);
        res.status(500).json({ error: 'Failed to fetch hotel offers' });
    }
});

// Example of handling coordinates (for location-based requests)
app.get('/api/getCoordinatesByLocation', async (req, res) => {
    const { location } = req.query;
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${location}&key=${GOOGLE_API_KEY}`);
        const data = await response.json();

        if (data.status === 'OK') {
            const coordinates = data.results[0].geometry.location;
            res.json(coordinates);  // Send back latitude and longitude
        } else {
            res.status(404).json({ error: 'Location not found' });
        }
    } catch (error) {
        console.error('Error fetching coordinates:', error.message);
        res.status(500).json({ error: 'Failed to fetch coordinates' });
    }
});

// Microsoft Graph setup for sending emails
const SCOPE = 'https://graph.microsoft.com/.default';
const TOKEN_ENDPOINT = `https://login.microsoftonline.com/${EMAIL_TENANT_ID}/oauth2/v2.0/token`;
const EMAIL_ADDRESS = "pierre@robotize.no"; // Sender email address

// Function to get Microsoft Graph access token
async function getGraphAccessToken() {
    const tokenData = {
        grant_type: 'client_credentials',
        client_id: EMAIL_CLIENT_ID,
        client_secret: EMAIL_CLIENT_SECRET,
        scope: SCOPE
    };

    const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenData).toString()
    });

    if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
}

// Function to send an email through Microsoft Graph API
async function sendEmail(subject, body, recipientEmail, token) {
    const SENDMAIL_ENDPOINT = `https://graph.microsoft.com/v1.0/users/${EMAIL_ADDRESS}/sendMail`;

    const message = {
        message: {
            subject: subject,
            body: {
                contentType: "HTML",
                content: body
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: recipientEmail
                    }
                }
            ]
        },
        saveToSentItems: "true"
    };

    const response = await fetch(SENDMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`);
    }

    return response.ok;
}

// Route to send an email using Microsoft Graph
app.post('/api/sendMail', async (req, res) => {
    const { subject = "New submission for your Flight Robot", body = "Great news, somebody just signed up for your Hotel Robot", recipient_email } = req.body;

    try {
        const token = await getGraphAccessToken();  // Get access token
        const result = await sendEmail(subject, body, recipient_email, token);  // Send email

        if (result) {
            res.json({ message: "Email sent successfully" });
        } else {
            res.status(500).json({ error: "Failed to send email" });
        }
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "An error occurred while sending email" });
    }
});

// Handle errors if needed
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
