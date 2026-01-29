const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // Import UUID library

console.log('[Init] Starting server...');

// Read logo as base64 at startup
let logoBase64;
try {
    logoBase64 = fs.readFileSync(path.join(__dirname, 'logo.png')).toString('base64');
    console.log('[Init] Logo loaded successfully.');
} catch (error) {
    console.error('[Error] Failed to load logo.png:', error);
    // Continue without the logo, email attachments will fail
}


const app = express();
const port = process.env.PORT || 8080;

// Validate required environment variables at startup
console.log('[Init] Validating environment variables...');
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
    console.error(`[CRITICAL] Missing required environment variables: ${missingVars.join(', ')}. Shutting down.`);
    process.exit(1);
}
console.log('[Init] All required environment variables are set.');

// Check optional environment variables
const optionalEnvVars = ['IPGEOLOCATION_API_KEY'];
const missingOptional = optionalEnvVars.filter(varName => !process.env[varName]);
if (missingOptional.length > 0) {
    console.warn(`[Warn] Optional environment variables not set: ${missingOptional.join(', ')}. Dependent features will be disabled.`);
}

// Environment variables
const {
    EMAIL_CLIENT_ID,
    EMAIL_CLIENT_SECRET,
    EMAIL_TENANT_ID,
    GOOGLE_API_KEY,
    SHEETY_API_URL,
    RAPID_API_KEY
} = process.env;

// Middleware
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[Request] Incoming: ${req.method} ${req.url}`);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

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

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper for fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.error(`[API] Request to ${url} timed out after ${timeout}ms.`);
        controller.abort();
    }, timeout);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
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

// --- API Routes ---

// Geolocation by IP
app.get('/api/geolocation', async (req, res) => {
    const apiKey = process.env.IPGEOLOCATION_API_KEY;
    if (!apiKey) {
        console.warn('[API] /api/geolocation: IPGeolocation API key not set. Feature disabled.');
        return res.status(503).json({ error: 'Geolocation service unavailable', message: 'API key not configured' });
    }

    const url = `https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey.trim()}`;
    console.log(`[API] /api/geolocation: Fetching from ${url}`);

    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API] /api/geolocation: IPGeolocation API error ${response.status}: ${errorText}`);
            return res.status(response.status).json({ error: 'Failed to fetch geolocation data' });
        }
        const data = await response.json();
        console.log(`[API] /api/geolocation: Successfully fetched location for IP ${data.ip}. Country: ${data.country_name}, Currency: ${data.currency.code}.`);
        res.json({
            currency: data.currency,
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude)
        });
    } catch (error) {
        console.error('[API] /api/geolocation: Geolocation request failed:', error);
        res.status(503).json({ error: 'Geolocation service unavailable', message: error.message });
    }
});

// Coordinates by Location Name
app.get('/api/getCoordinatesByLocation', async (req, res) => {
    const { location } = req.query;
    console.log(`[API] /api/getCoordinatesByLocation: Received request for location: "${location}"`);

    if (!location || typeof location !== 'string' || location.trim().length === 0) {
        console.error('[API] /api/getCoordinatesByLocation: Validation failed - location is missing or invalid.');
        return res.status(400).json({ error: "Please provide a valid location." });
    }

    try {
        const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
        console.log(`[API] /api/getCoordinatesByLocation: Calling Google Geocoding API.`);
        const response = await fetchWithTimeout(geocodingUrl);

        if (!response.ok) {
            console.error(`[API] /api/getCoordinatesByLocation: Google Geocoding API error: ${response.status}`);
            throw new Error(`Google Geocoding API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            console.log(`[API] /api/getCoordinatesByLocation: Found ${data.results.length} results. Using first result.`);
            return res.json(data);
        } else {
            console.warn(`[API] /api/getCoordinatesByLocation: Location not found for query "${location}". Status: ${data.status}`);
            return res.status(404).json({ error: 'Location not found' });
        }
    } catch (error) {
        console.error('[API] /api/getCoordinatesByLocation: Error fetching coordinates:', error.message);
        return res.status(500).json({ error: 'Failed to fetch coordinates' });
    }
});

// Hotel Offers by Coordinates
app.get('/api/getHotelOffersByCoordinates', async (req, res) => {
    const { latitude, longitude, arrival_date, departure_date, adults, room_qty, currency_code } = req.query;
    console.log('[API] /api/getHotelOffersByCoordinates: Received search request.');

    if (!latitude || !longitude || !arrival_date || !departure_date || !adults || !room_qty || !currency_code) {
        console.error('[API] /api/getHotelOffersByCoordinates: Validation failed - missing required parameters.');
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const url = new URL('https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotelsByCoordinates');
    url.search = new URLSearchParams({ latitude, longitude, arrival_date, departure_date, radius: '10', adults, room_qty, currency_code }).toString();

    console.log(`[API] /api/getHotelOffersByCoordinates: Calling RapidAPI for hotels.`);
    try {
        const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-ua': 'RapidAPI-Playground',
                'x-rapidapi-key': RAPID_API_KEY,
                'x-rapidapi-host': 'booking-com15.p.rapidapi.com'
            }
        });

        if (!response.ok) {
            console.error(`[API] /api/getHotelOffersByCoordinates: RapidAPI error: ${response.status}`);
            throw new Error(`RapidAPI error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[API] /api/getHotelOffersByCoordinates: Successfully fetched ${data.data?.result?.length || 0} offers.`);
        res.json(data);
    } catch (error) {
        console.error('[API] /api/getHotelOffersByCoordinates: Error fetching hotel offers:', error.message);
        res.status(500).json({ error: 'Failed to fetch hotel offers' });
    }
});

// Send Data to Sheety
app.post('/api/sendDataToSheety', async (req, res) => {
    const formData = req.body;
    console.log('[API] /api/sendDataToSheety: Received request to save tracking data.');

    if (!formData.location || !formData.checkInDate || !formData.checkOutDate || !formData.adults || !formData.numberOfRooms || !formData.email || !formData.selectedHotels || formData.selectedHotels.length === 0) {
        console.error('[API] /api/sendDataToSheety: Validation failed - missing required fields.');
        return res.status(400).json({ error: "Missing required fields." });
    }

    const uniqueToken = uuidv4();
    const sheetyData = {
        price: {
            hotel: formData.selectedHotels.map(h => h.hotelId).join(', '),
            hotelName: formData.selectedHotels.map(h => h.hotelName).join(', '),
            adults: formData.adults,
            rooms: formData.numberOfRooms,
            checkin: formData.checkInDate,
            checkout: formData.checkOutDate,
            latestPrice: formData.selectedHotels.map(h => h.totalPrice).join(', '),
            lowestPrice: formData.selectedHotels.map(h => h.totalPrice).join(', '),
            currency: formData.currency,
            email: formData.email,
            token: uniqueToken
        }
    };
    console.log(`[API] /api/sendDataToSheety: Sending data to Sheety for email: ${formData.email}`);

    try {
        const response = await fetchWithTimeout(SHEETY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sheetyData)
        });

        if (!response.ok) {
            const responseBody = await response.text();
            console.error(`[API] /api/sendDataToSheety: Sheety API error ${response.status}: ${responseBody}`);
            return res.status(response.status).json({ error: `Error sending data to Sheety` });
        }

        const result = await response.json();
        console.log(`[API] /api/sendDataToSheety: Successfully saved data. Sheety row ID: ${result.price.id}`);
        res.status(200).json(result);
    } catch (error) {
        console.error('[API] /api/sendDataToSheety: Error sending data to Sheety:', error.message);
        res.status(500).json({ error: `Error sending data to Sheety: ${error.message}` });
    }
});

// Send Email
app.post('/api/sendEmail', async (req, res) => {
    const { subject, body, recipient_email } = req.body;
    console.log(`[Email] /api/sendEmail: Received request to send email to ${recipient_email}.`);

    if (!subject || !body || !recipient_email) {
        console.error('[Email] /api/sendEmail: Validation failed - missing required parameters.');
        return res.status(400).json({ message: "Missing required parameters." });
    }

    try {
        console.log('[Email] /api/sendEmail: Acquiring MS Graph access token...');
        const token = await getAccessToken();
        console.log('[Email] /api/sendEmail: Access token acquired. Sending email...');
        const result = await sendEmail(subject, body, recipient_email, token);

        console.log('[Email] /api/sendEmail: Email send operation completed.');
        return res.status(result ? 200 : 500).json({ message: result ? "Email sent successfully." : "Failed to send email." });
    } catch (error) {
        console.error('[Email] /api/sendEmail: Unhandled error during email sending:', error);
        return res.status(500).json({ message: `Error during email sending: ${error.message}` });
    }
});

async function getAccessToken() {
    const tokenData = { grant_type: 'client_credentials', client_id: EMAIL_CLIENT_ID, client_secret: EMAIL_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' };
    const response = await fetchWithTimeout(`https://login.microsoftonline.com/${EMAIL_TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenData).toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Email] Error fetching MS Graph token: ${response.status} - ${errorText}`);
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
            body: { contentType: "HTML", content: body },
            toRecipients: [{ emailAddress: { address: recipient_email } }],
            bccRecipients: [{ emailAddress: { address: 'pierre@robotize.no' } }],
            attachments: logoBase64 ? [{ "@odata.type": "#microsoft.graph.fileAttachment", name: "logo.png", contentType: "image/png", contentBytes: logoBase64, contentId: "logo", isInline: true }] : []
        },
        saveToSentItems: "true"
    };

    try {
        const response = await fetchWithTimeout(SENDMAIL_ENDPOINT, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("[Email] MS Graph sendMail API error:", errorData);
            throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`);
        }
        console.log(`[Email] Email successfully sent via MS Graph to ${recipient_email}.`);
        return true;
    } catch (error) {
        console.error("[Email] Unhandled error in sendEmail function:", error);
        return false;
    }
}

// Start Server
app.listen(port, () => {
    console.log(`[Init] Server is running on port ${port}`);
    console.log(`[Init] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('[Init] Application ready.');
});
