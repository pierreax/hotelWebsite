const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Import UUID library

const app = express();
const port = process.env.PORT || 8080;

// Access environment variables directly from process.env
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;
const EMAIL_CLIENT_ID = process.env.EMAIL_CLIENT_ID;
const EMAIL_CLIENT_SECRET = process.env.EMAIL_CLIENT_SECRET;
const EMAIL_TENANT_ID = process.env.EMAIL_TENANT_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const SHEETY_API_URL = process.env.SHEETY_API_URL;

// Middleware to parse JSON requests
app.use(express.json());

// Serve static files from the root directory (e.g., for your HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Send index.html file for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
            return res.json(coordinates);  // Send back latitude and longitude
        } else {
            console.log('No results found for location:', location);
            return res.status(404).json({ error: 'Location not found' });
        }
    } catch (error) {
        console.error('Error fetching coordinates:', error.message);
        return res.status(500).json({ error: 'Failed to fetch coordinates' });
    }
});


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



// ------------ AMADEUS ---------------

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

// API to get hotels by coordinates from Amadeus
app.get('/api/getHotelsByCoordinates', async (req, res) => {
    const accessToken = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;
    const { lat, lng, radius = 10, radiusUnit = 'KM', hotelSource = 'ALL' } = req.query;

    // Unauthorized if accessToken is missing
    if (!accessToken) {
        return res.status(401).json({
            message: 'Unauthorized: Access token missing'
        });
    }

    // Latitude and longitude are required
    if (!lat || !lng) {
        return res.status(400).json({
            message: 'Latitude and longitude are required'
        });
    }

    try {
        // Fetch hotels data from Amadeus API
        const hotelsResponse = await fetch(`https://api.amadeus.com/v1/reference-data/locations/hotels/by-geocode?latitude=${lat}&longitude=${lng}&radius=${radius}&radiusUnit=${radiusUnit}&hotelSource=${hotelSource}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        // If the response is not OK, handle the error
        if (!hotelsResponse.ok) {
            const errorText = await hotelsResponse.text();
            let errorMessage;

            try {
                // Try to parse the error text as JSON
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.errors?.[0]?.detail || 'Unknown error occurred';
            } catch (parseError) {
                // If parsing fails, use the raw error text
                errorMessage = errorText || 'Unknown error occurred';
            }

            return res.status(hotelsResponse.status).json({
                message: `Error fetching hotels: ${errorMessage}`
            });
        }

        // Parse the JSON response from Amadeus
        const hotelsData = await hotelsResponse.json();

        // Check if there are no hotels in the response
        if (!hotelsData.data || hotelsData.data.length === 0) {
            return res.status(200).json({
                message: 'There are no available hotels in the area'
            });
        }

        // Return the hotels data if successful
        return res.status(200).json(hotelsData);

    } catch (error) {
        // Catch any errors and return a server error
        console.error('Error fetching hotels:', error.message);
        return res.status(500).json({
            message: `Error fetching hotels: ${error.message}`
        });
    }
});

app.get('/api/getHotelOffers', async (req, res) => {
    // Extract parameters from query
    const { hotelIds, adults, checkInDate, checkOutDate, roomQuantity } = req.query;
    const accessToken = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;

    // Check if access token is provided
    if (!accessToken) {
        return res.status(401).json({ message: 'Unauthorized: Access token missing' });
    }

    // Validate required query parameters
    if (!hotelIds || !checkInDate || !checkOutDate || !adults || !roomQuantity) {
        return res.status(400).json({ message: 'Missing required query parameters' });
    }

    try {
        // Construct the Amadeus API URL with query parameters
        const amadeusUrl = new URL('https://api.amadeus.com/v3/shopping/hotel-offers');
        amadeusUrl.search = new URLSearchParams({
            hotelIds,
            adults,
            checkInDate,
            checkOutDate,
            roomQuantity,
            paymentPolicy: 'NONE',  // Set default payment policy
            bestRateOnly: true,    // Filter for best rates
            includeClosed: false   // Exclude closed hotels
        }).toString();

        // Log the URL for debugging
        console.log('Fetching hotel offers with URL:', amadeusUrl.toString());

        // Make the request to Amadeus API with the Authorization header
        const response = await fetch(amadeusUrl.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        // If the response is not OK, handle the error
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage;

            try {
                // Attempt to parse the error response as JSON
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.errors?.[0]?.detail || 'Unknown error occurred';
            } catch (parseError) {
                // If parsing fails, fallback to raw error text
                errorMessage = errorText || 'Unknown error occurred';
            }

            return res.status(response.status).json({ message: `Error fetching hotel offers: ${errorMessage}` });
        }

        // Parse the response data as JSON
        const data = await response.json();

        // Check if no valid hotel offers are found
        if (!data || !data.data || data.data.length === 0) {
            return res.status(200).json({
                message: 'No valid hotel offers available for the selected criteria.'
            });
        }

        // Return the hotel offers data
        res.status(200).json(data);

    } catch (error) {
        // Catch any unexpected errors and send an appropriate message
        console.error('Error fetching hotel offers:', error.message);
        res.status(500).json({ message: `Error fetching hotel offers: ${error.message}` });
    }
});



// Route to fetch hotel ratings from Amadeus
app.post('/api/getHotelRatings', async (req, res) => {
    try {
        const { hotelIds } = req.body;
        const accessToken = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;

        if (!accessToken) {
            return res.status(401).json({ message: 'Unauthorized: Access token missing' });
        }

        if (!hotelIds || hotelIds.length === 0) {
            return res.status(400).json({ error: 'No hotel IDs provided.' });
        }

        // Fetch ratings for the provided hotel IDs
        const ratings = await fetchRatingsForChunk(hotelIds, accessToken);
        return res.status(200).json(ratings); // Return ratings directly
    } catch (error) {
        console.error('Error in /api/getHotelRatings:', error);
        return res.status(500).json({ error: 'Error processing hotel ratings request.' });
    }
});

// Fetch ratings for a chunk of hotels from Amadeus API
async function fetchRatingsForChunk(hotelIds, accessToken) {
    const hotelIdsString = hotelIds.join(',');

    try {
        // Construct the URL with query parameters
        const amadeusUrl = `https://api.amadeus.com/v2/e-reputation/hotel-sentiments?hotelIds=${hotelIdsString}`;
        console.log('Amadeus API URL:', amadeusUrl);
        console.log('Authorization token:', accessToken);

        // Make the request to the Amadeus API
        const response = await fetch(amadeusUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Check if the response is OK
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response from Amadeus API:', errorText);
            throw new Error(`Error fetching hotel ratings: ${errorText}`);
        }

        // Parse and return the response data
        const data = await response.json();
        console.log('Amadeus API Response:', data);
        return data.data; // Return the ratings array from the response
    } catch (error) {
        console.error('Error fetching hotel ratings for IDs:', hotelIdsString, error);
        throw error;
    }
}

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

// Define the /api/sendEmail route to handle email sending
app.post('/api/sendEmail', async (req, res) => {
    try {
        const { subject, body, recipient_email } = req.body;

        // Validate required parameters
        if (!subject || !body || !recipient_email) {
            return res.status(400).json({ message: "Missing required parameters: subject, body, or recipient_email." });
        }

        // Get access token for Microsoft Graph API
        const token = await getAccessToken();

        // Send the email via Microsoft Graph API
        const result = await sendEmail(subject, body, recipient_email, token);

        // Return success or failure response
        return res.status(result ? 200 : 500).json({ message: result ? "Email sent successfully." : "Failed to send email." });

    } catch (error) {
        console.error('Error during email sending:', error.message);
        return res.status(500).json({ message: "An error occurred while processing the request." });
    }
});

// Helper function to get the Microsoft Graph API access token
async function getAccessToken() {
    const tokenData = {
        grant_type: 'client_credentials',
        client_id: EMAIL_CLIENT_ID,
        client_secret: EMAIL_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default';
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

// Helper function to send email using Microsoft Graph API
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
            ],
            attachments: []  // No image attachment
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

// Handle errors if needed
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
