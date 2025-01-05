const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Import UUID library

const app = express();

// Access environment variables directly from process.env
const EMAIL_CLIENT_ID = process.env.EMAIL_CLIENT_ID;
const EMAIL_CLIENT_SECRET = process.env.EMAIL_CLIENT_SECRET;
const EMAIL_TENANT_ID = process.env.EMAIL_TENANT_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const SHEETY_API_URL = process.env.SHEETY_API_URL;
const RAPID_API_KEY = process.env.RAPID_API_KEY;

// Middleware to parse JSON requests
app.use(express.json());

// Serve static files from the root directory (e.g., for your HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Send index.html file for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Set CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://www.robotize.no');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Set CSP headers
app.use((req, res, next) => {
    res.header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'self' https://www.robotize.no;");
    next();
});

// ------------ Initialization ---------------

// API to get Coordinates By Location from Google
app.get('/api/getCoordinatesByLocation', async (req, res) => {
    const { location } = req.query;
    console.log('Coordinate API Triggered for location:', location);

    if (!location) {
        return res.status(400).json({ error: "Please provide a location." });
    }

    if (!GOOGLE_API_KEY) {
        return res.status(500).json({ error: "API key is not configured." });
    }

    try {
        const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
        const response = await fetch(geocodingUrl);
        const data = await response.json();

        console.log('Google API response:', data);  // Log the entire response from Google API

        if (data.status === 'OK' && data.results.length > 0) {
            const coordinates = data.results[0].geometry.location;
            console.log('Coordinates:', coordinates);
            return res.json(data);  // Sends the full response from Google API
        } else {
            console.log('No results found for location:', location);
            return res.status(404).json({ error: 'Location not found' });
        }
    } catch (error) {
        console.error('Error fetching coordinates:', error.message);
        return res.status(500).json({ error: 'Failed to fetch coordinates' });
    }
});

// API to get FX Rates from ExchangeRate-API
app.get('/api/getFxRates', async (req, res) => {
    const { baseCurrency } = req.query;

    if (!baseCurrency) {
        return res.status(400).json({ error: 'Base currency is required.' });
    }

    try {
        // Construct the Exchange Rate API URL using the API key and base currency
        const apiUrl = `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/${baseCurrency}`;
        
        // Fetch FX rates from the API
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch FX rates: ${response.statusText}`);
        }

        const data = await response.json();

        // Ensure conversion rates exist in the response
        if (!data.conversion_rates) {
            throw new Error('Conversion rates not found in API response');
        }

        // Return the conversion rates to the client
        res.json(data.conversion_rates);
    } catch (error) {
        console.error('Error fetching FX rates:', error.message);
        res.status(500).json({ error: 'Failed to fetch FX rates.' });
    }
});



// ------------ RAPID API ---------------
app.get('/api/getHotelOffersByCoordinates', async (req, res) => {
    const { latitude, longitude, arrival_date, departure_date, adults, room_qty, currency_code } = req.query;

    console.log('Request parameters:', req.query);

    const options = {
        method: 'GET',
        url: 'https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotelsByCoordinates',
        params: {
            latitude,
            longitude,
            arrival_date,
            departure_date,
            radius: '10', // Static radius
            adults,
            room_qty,
            currency_code
        },
        headers: {
            'x-rapidapi-ua': 'RapidAPI-Playground',
            'x-rapidapi-key': RAPID_API_KEY,
            'x-rapidapi-host': 'booking-com15.p.rapidapi.com'
        }
    };

    try {
        const response = await axios.request(options);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching hotel offers:', error.response ? error.response.data : error.message);
        res.status(500).send('An error occurred while fetching hotel offers',error.response ? error.response.data : error.message);
    }
});


// --------- SHEETY ----------------

app.post('/api/sendDataToSheety', async (req, res) => {
    // Get data from the request body
    const formData = req.body;
    console.log('Incoming request body:', JSON.stringify(formData, null, 2));

    // Check if the required fields are present
    if (!formData.location || !formData.checkInDate || !formData.checkOutDate || 
        !formData.adults || !formData.numberOfRooms || !formData.email ||
        !formData.selectedHotels || formData.selectedHotels.length === 0) {
        return res.status(400).json({
            error: "Missing required fields in the request body."
        });
    }

    // Generate a unique token for this submission
    const uniqueToken = uuidv4(); // Generate a UUID

    // Extract and format data
    const hotelNames = formData.selectedHotels.map(hotel => hotel.hotelName).join(', ');
    const hotelIds = formData.selectedHotels.map(hotel => hotel.hotelId).join(', ');
    const roomTypes = formData.selectedHotels.map(hotel => hotel.roomType).join(', ');
    const prices = formData.selectedHotels.map(hotel => hotel.pricePerNight.replace(/[^\d.,]/g, '')).join(', '); // Remove currency symbols
    const totalPrices = formData.selectedHotels.map(hotel => hotel.totalPrice.replace(/[^\d.,]/g, '')).join(', '); // Remove currency symbols

    // Format data to match Sheety's schema
    const sheetyData = {
        price: {
            hotel: hotelIds, // Use hotel IDs from the form data
            hotelName: hotelNames, // Use hotel names from the form data
            adults: formData.adults,
            rooms: formData.numberOfRooms,
            roomtype: roomTypes, // Use room types from the form data
            checkin: formData.checkInDate,
            checkout: formData.checkOutDate,
            latestPrice: totalPrices, // Prices from the form data, currency symbols removed
            lowestPrice: totalPrices, // Send the same price as lowest price initially
            currency: formData.currency, // Currency from the form data
            email: formData.email,
            token: uniqueToken // Add the unique token to the data
        }
    };

    console.log('Formatted data to be sent to Sheety:', JSON.stringify(sheetyData, null, 2));

    // Sheety URL (change this to the correct Sheety endpoint for your sheet)
    const sheetyUrl = SHEETY_API_URL;

    try {
        // Send data to Sheety
        const response = await fetch(sheetyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sheetyData)
        });

        // Log the response status
        console.log('Sheety response status:', response.status);

        // Check if the response is successful
        if (!response.ok) {
            const responseBody = await response.text(); // Get the raw response body for debugging
            console.error(`Error sending data to Sheety: ${responseBody}`);
            return res.status(response.status).json({
                error: `Error sending data to Sheety: ${responseBody}`
            });
        }

        const result = await response.json();

        // Log the successful response
        console.log('Successful response from Sheety:', JSON.stringify(result, null, 2));

        res.status(200).json(result); // Return the successful response from Sheety

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

        // Get access token for Microsoft Graph API
        const token = await getAccessToken();

        // Log the token to verify it
        console.log("Access Token:", token);

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
        scope: 'https://graph.microsoft.com/.default'  // Make sure this scope is correct
    };

    const response = await fetch(`https://login.microsoftonline.com/${EMAIL_TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenData).toString()
    });

    if (!response.ok) {
        console.error('Error fetching token:', await response.text());
        throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Access Token:', data.access_token); // Log to verify the token
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
            attachments: []  // No image attachment
        },
        saveToSentItems: "true"
    };

    try {
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
app.listen(8080, () => {
    console.log(`Server is running on port 8080`);
});
  
