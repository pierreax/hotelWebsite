const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Import UUID library

const app = express();
const port = process.env.PORT || 8080;

// Validate required environment variables at startup
const requiredEnvVars = [
    'EMAIL_CLIENT_ID',
    'EMAIL_CLIENT_SECRET',
    'EMAIL_TENANT_ID',
    'GOOGLE_API_KEY',
    'SHEETY_API_URL',
    'RAPID_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

// Optional environment variables
const optionalEnvVars = ['IPGEOLOCATION_API_KEY'];
const missingOptional = optionalEnvVars.filter(varName => !process.env[varName]);
if (missingOptional.length > 0) {
    console.warn(`Optional environment variables not set (features will be disabled): ${missingOptional.join(', ')}`);
}

// Access environment variables directly from process.env
const EMAIL_CLIENT_ID = process.env.EMAIL_CLIENT_ID;
const EMAIL_CLIENT_SECRET = process.env.EMAIL_CLIENT_SECRET;
const EMAIL_TENANT_ID = process.env.EMAIL_TENANT_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SHEETY_API_URL = process.env.SHEETY_API_URL;
const RAPID_API_KEY = process.env.RAPID_API_KEY;

// Middleware to parse JSON requests
app.use(express.json());

// Set CORS headers - MUST come before static files
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Set CSP headers - Allow CDN resources for Bootstrap, jQuery, Flatpickr
app.use((req, res, next) => {
    res.header('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://code.jquery.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        "font-src 'self' https://cdn.jsdelivr.net; " +
        "frame-ancestors 'self' https://www.robotize.no;"
    );
    next();
});

// Serve static files from the root directory (e.g., for your HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Send index.html file for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper function for fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}

// ------------ Initialization ---------------

// Route to get user geolocation and currency based on IP
app.get('/api/geolocation', async (req, res) => {
    try {
        const apiKey = process.env.IPGEOLOCATION_API_KEY;

        if (!apiKey) {
            console.warn('IPGeolocation API key is not set. Geolocation feature disabled.');
            return res.status(503).json({
                error: 'Geolocation service unavailable',
                message: 'API key not configured'
            });
        }

        const cleanedApiKey = apiKey.trim();
        const url = `https://api.ipgeolocation.io/ipgeo?apiKey=${cleanedApiKey}`;

        const response = await fetchWithTimeout(url);

        if (!response.ok) {
            const status = response.status;
            const responseText = await response.text();

            if (status === 401) {
                console.error('IPGeolocation API: Invalid or expired API key (401)');
                return res.status(503).json({
                    error: 'Geolocation service unavailable',
                    message: 'Invalid API credentials'
                });
            }

            console.error(`IPGeolocation API error ${status}: ${responseText}`);
            throw new Error(`IPGeolocation API error: ${status}`);
        }

        const data = await response.json();

        // Only send back what's needed to reduce exposure
        res.json({
            currency: data.currency,
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude)
        });
    } catch (error) {
        console.error('Geolocation error:', error);
        res.status(503).json({
            error: 'Geolocation service unavailable',
            message: error.message
        });
    }
});

// API to get Coordinates By Location from Google
app.get('/api/getCoordinatesByLocation', async (req, res) => {
    const { location } = req.query;

    // Validate input
    if (!location || typeof location !== 'string' || location.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a valid location." });
    }

    if (location.length > 200) {
        return res.status(400).json({ error: "Location query too long. Maximum 200 characters." });
    }

    try {
        const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
        const response = await fetchWithTimeout(geocodingUrl);

        if (!response.ok) {
            throw new Error(`Google Geocoding API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            return res.json(data);  // Sends the full response from Google API
        } else {
            return res.status(404).json({ error: 'Location not found' });
        }
    } catch (error) {
        console.error('Error fetching coordinates:', error.message);
        return res.status(500).json({ error: 'Failed to fetch coordinates' });
    }
});



// ------------ RAPID API ---------------
app.get('/api/getHotelOffersByCoordinates', async (req, res) => {
    const { latitude, longitude, arrival_date, departure_date, adults, room_qty, currency_code } = req.query;

    // Validate required parameters
    if (!latitude || !longitude || !arrival_date || !departure_date || !adults || !room_qty || !currency_code) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Validate coordinates
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Invalid latitude. Must be between -90 and 90.' });
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'Invalid longitude. Must be between -180 and 180.' });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(arrival_date) || !dateRegex.test(departure_date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const url = new URL('https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotelsByCoordinates');
    url.search = new URLSearchParams({
        latitude,
        longitude,
        arrival_date,
        departure_date,
        radius: '10', // Static radius
        adults,
        room_qty,
        currency_code
    }).toString();

    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-ua': 'RapidAPI-Playground',
            'x-rapidapi-key': RAPID_API_KEY,
            'x-rapidapi-host': 'booking-com15.p.rapidapi.com'
        }
    };

    try {
        const response = await fetchWithTimeout(url, options);
        if (!response.ok) {
            throw new Error(`RapidAPI error: ${response.status}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching hotel offers:', error.message);
        res.status(500).json({ error: 'Failed to fetch hotel offers' });
    }
});


// --------- SHEETY ----------------

app.post('/api/sendDataToSheety', async (req, res) => {
    // Get data from the request body
    const formData = req.body;

    // Check if the required fields are present
    if (!formData.location || !formData.checkInDate || !formData.checkOutDate ||
        !formData.adults || !formData.numberOfRooms || !formData.email ||
        !formData.selectedHotels || formData.selectedHotels.length === 0) {
        return res.status(400).json({
            error: "Missing required fields in the request body."
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Generate a unique token for this submission
    const uniqueToken = uuidv4(); // Generate a UUID

    // Extract and format data
    const hotelNames = formData.selectedHotels.map(hotel => hotel.hotelName).join(', ');
    const hotelIds = formData.selectedHotels.map(hotel => hotel.hotelId).join(', ');
    const totalPrices = formData.selectedHotels.map(hotel => hotel.totalPrice).join(', ');

    // Format data to match Sheety's schema
    const sheetyData = {
        price: {
            hotel: hotelIds, // Use hotel IDs from the form data
            hotelName: hotelNames, // Use hotel names from the form data
            adults: formData.adults,
            rooms: formData.numberOfRooms,
            checkin: formData.checkInDate,
            checkout: formData.checkOutDate,
            latestPrice: totalPrices, // Prices from the form data, currency symbols removed
            lowestPrice: totalPrices, // Send the same price as lowest price initially
            currency: formData.currency, // Currency from the form data
            email: formData.email,
            token: uniqueToken // Add the unique token to the data
        }
    };

    try {
        // Send data to Sheety
        const response = await fetchWithTimeout(SHEETY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sheetyData)
        });

        // Check if the response is successful
        if (!response.ok) {
            const responseBody = await response.text();
            console.error(`Error sending data to Sheety: ${response.status} - ${responseBody}`);
            return res.status(response.status).json({
                error: `Error sending data to Sheety`
            });
        }

        const result = await response.json();
        res.status(200).json(result);

    } catch (error) {
        console.error('Error sending data to Sheety:', error.message);
        res.status(500).json({
            error: `Error sending data to Sheety: ${error.message}`
        });
    }
});

// ------------ EMAIL ---------------

app.post('/api/sendEmail', async (req, res) => {
    try {
        const { subject, body, recipient_email } = req.body;

        // Validate required parameters
        if (!subject || !body || !recipient_email) {
            return res.status(400).json({ message: "Missing required parameters: subject, body, or recipient_email." });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipient_email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Get access token for Microsoft Graph API
        const token = await getAccessToken();

        // Send the email via Microsoft Graph API
        const result = await sendEmail(subject, body, recipient_email, token);

        // Return success or failure response
        return res.status(result ? 200 : 500).json({ message: result ? "Email sent successfully." : "Failed to send email." });

    } catch (error) {
        console.error('Error during email sending:', error.message);

        // Send error message back to frontend
        return res.status(500).json({ message: `Error during email sending: ${error.message}` });
    }
});


async function getAccessToken() {
    const tokenData = {
        grant_type: 'client_credentials',
        client_id: EMAIL_CLIENT_ID,
        client_secret: EMAIL_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default'
    };

    const response = await fetchWithTimeout(`https://login.microsoftonline.com/${EMAIL_TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenData).toString()
    });

    if (!response.ok) {
        console.error('Error fetching token:', await response.text());
        throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
}



async function sendEmail(subject, body, recipient_email, token) {
    const SENDMAIL_ENDPOINT = `https://graph.microsoft.com/v1.0/users/pierre@robotize.no/sendMail`;

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
                        address: recipient_email
                    }
                }
            ],
            bccRecipients: [
                {
                    emailAddress: {
                        address: 'pierre@robotize.no'
                    }
                }
            ],
            attachments: []
        },
        saveToSentItems: "true"
    };

    try {
        const response = await fetchWithTimeout(SENDMAIL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error response from Microsoft Graph:", errorData);
            throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`);
        }

        return response.ok;
    } catch (error) {
        console.error("Error in sendEmail function:", error);
        throw error;
    }
}

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
  
