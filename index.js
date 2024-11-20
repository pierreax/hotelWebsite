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
const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;

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
    console.log('Coordinate API Triggered', location);

    if (!location) {
        return res.status(400).json({ error: "Please provide a location." });
    }

    try {
        // Make sure GOOGLE_API_KEY is stored in an environment variable for security
        const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
        const response = await fetch(geocodingUrl);
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
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
    const { latitude, longitude, radius = 10, radiusUnit = 'KM', hotelSource = 'ALL' } = req.query;
    const accessToken = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;

    if (!accessToken) {
        return res.status(401).json({ message: 'Unauthorized: Access token missing' });
    }

    if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    try {
        const hotelsResponse = await fetch(`https://api.amadeus.com/v1/reference-data/locations/hotels/by-geocode?latitude=${latitude}&longitude=${longitude}&radius=${radius}&radiusUnit=${radiusUnit}&hotelSource=${hotelSource}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        // If the response is not OK, handle the error
        if (!hotelsResponse.ok) {
            const errorText = await hotelsResponse.text();
            let errorMessage;

            try {
                // Attempt to parse the error text as JSON
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.errors?.[0]?.detail || 'Unknown error occurred';
            } catch (parseError) {
                // If parsing fails, fallback to raw error text
                errorMessage = errorText || 'Unknown error occurred';
            }

            return res.status(hotelsResponse.status).json({ message: `Error fetching hotels: ${errorMessage}` });
        }

        const hotelsData = await hotelsResponse.json();
        
        // Check if there are no hotels in the response
        if (!hotelsData.data || hotelsData.data.length === 0) {
            return res.status(200).json({ message: 'There are no available hotels in the area' });
        }

        // Return the hotels data if successful
        res.status(200).json(hotelsData);

    } catch (error) {
        console.error('Error fetching hotels:', error.message);
        res.status(500).json({ message: `Error fetching hotels: ${error.message}` });
    }
});

app.get('/api/getHotelOffers', async (req, res) => {
    const { hotelIds, adults, checkInDate, checkOutDate, roomQuantity } = req.query;
    const accessToken = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;

    if (!accessToken) {
        return res.status(401).json({ message: 'Unauthorized: Access token missing' });
    }

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
            paymentPolicy: 'NONE',
            bestRateOnly: true,
            includeClosed: false
        }).toString();

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
                // Attempt to parse the error text as JSON
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.errors?.[0]?.detail || 'Unknown error occurred';
            } catch (parseError) {
                // If parsing fails, fallback to raw error text
                errorMessage = errorText || 'Unknown error occurred';
            }

            return res.status(response.status).json({ message: `Error fetching hotel offers: ${errorMessage}` });
        }

        const data = await response.json();

        // Return the hotel offers data if successful
        res.status(200).json(data);

    } catch (error) {
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
    const sheetyEndpoint = 'https://api.sheety.co/YOUR_SHEETY_API_URL/sheet1'; // Replace with your Sheety endpoint
    const formData = req.body; // Data sent from the front-end

    console.log('Received data for Sheety:', formData);

    // Prepare the data to send to Sheety
    const sheetData = {
        location: formData.location,
        checkInDate: formData.checkInDate,
        checkOutDate: formData.checkOutDate,
        adults: formData.adults,
        numberOfRooms: formData.numberOfRooms,
        email: formData.email,
        currency: formData.currency,
        selectedHotels: formData.selectedHotels // Modify according to your sheet's structure
    };

    try {
        // Send the data to Sheety
        const response = await fetch(sheetyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sheet1: sheetData }) // Modify the object according to the Sheety API
        });

        // Parse the response
        const responseData = await response.json();

        if (response.ok) {
            console.log('Data successfully submitted to Sheety:', responseData);
            res.status(200).json(responseData); // Send success response back to the client
        } else {
            console.error('Error submitting data to Sheety:', responseData);
            res.status(500).json({ error: 'Failed to submit data to Sheety' });
        }
    } catch (error) {
        console.error('Error in submitting data to Sheety:', error.message);
        res.status(500).json({ error: 'Error in submitting data to Sheety' });
    }
});

// ------------ EMAIL ---------------



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
