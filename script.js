document.getElementById('searchForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const location = document.getElementById('location').value;
    const checkInDate = document.getElementById('checkInDate').value;
    const checkOutDate = document.getElementById('checkOutDate').value;
    const adults = document.getElementById('adults').value;
    const numberOfRooms = document.getElementById('numberOfRooms').value; // New field for number of rooms
    const email = document.getElementById('email').value; // New field for email address
    const limitResults = parseInt(document.getElementById('limitResults').value, 10);

    console.log('Form Data:', {
        location,
        checkInDate,
        checkOutDate,
        adults,
        numberOfRooms,
        email
    });

    const getAccessTokenUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetAmadeusAccessToken?code=8-Ok9mpy3X22aWVQSXBs_djXz57bJvh23XJAPuY-yH9jAzFu8nDFaA%3D%3D';
    const getHotelsByCoordinatesUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelsByCoordinates?code=_9_S3ATWEtYncsW6pzX2gKatTmRWbkHKc9O2GsD-74BqAzFupvm9kA%3D%3D';
    const getHotelOffersUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelOffers?code=N5p8k9qzS_NgW_h2mHWm_xKOpPHY2Cjb_nh_TCturrA5AzFuCXBy-g%3D%3D';
    const getCoordinatesByLocationUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetCoordinatesByLocation?code=tyHMhU1QpcgHHWUrwfor8PtyYEzW-keeu2daJnRQqdQxAzFuPgYxzA%3D%3D';

    let accessToken;
    let internalHotelIds = []; // Store hotel IDs for later use
    let locationCoordinates; // Store coordinates of the searched location

    function getLocationCoordinates(location) {
        const apiUrl = `${getCoordinatesByLocationUrl}&location=${encodeURIComponent(location)}`;

        console.log('Coordinates URL:', apiUrl);

        return fetch(apiUrl)
            .then(response => response.text()) // Use text() to handle non-JSON responses
            .then(text => {
                try {
                    return JSON.parse(text); // Try to parse the response as JSON
                } catch (err) {
                    throw new Error(`Response is not valid JSON: ${text}`);
                }
            })
            .then(data => {
                console.log('Coordinates Data:', data);
                locationCoordinates = data; // Save the location coordinates
                return data;
            })
            .catch(error => {
                console.error('Error:', error.message);
                throw error;
            });
    }

    function formatHotelName(name) {
        if (!name) return 'N/A';
        return name
            .toLowerCase() // Convert the entire name to lowercase
            .replace(/\b\w/g, char => char.toUpperCase()); // Capitalize the first letter of each word
    }

    function formatRoomType(type) {
        // Convert room type to a more readable format
        if (!type) return 'N/A';

        return type
            .replace(/_/g, ' ') // Replace underscores with spaces
            .toLowerCase() // Convert to lowercase
            .replace(/\b\w/g, char => char.toUpperCase()); // Capitalize first letter of each word
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in kilometers
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance in kilometers
        return distance.toFixed(2); // Return the distance rounded to 2 decimal places
    }

    function fetchHotelOffers(validHotelIds) {
        const limitedHotelIds = validHotelIds.slice(0, limitResults);
        const url = `${getHotelOffersUrl}&hotelIds=${limitedHotelIds.join(',')}&adults=${adults}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&roomQuantity=${numberOfRooms}&paymentPolicy=NONE&bestRateOnly=true`;

        console.log('Fetching hotel offers with URL:', url);

        return fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
        .then(response => response.text())
        .then(text => {
            try {
                const response = JSON.parse(text);
                console.log('Hotel offers response:', response);

                if (response.errors) {
                    const errorDetails = response.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                    throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
                }
                return response;
            } catch (err) {
                throw new Error(`Failed to parse hotel offers response: ${text}`);
            }
        });
    }

    fetch(getAccessTokenUrl)
        .then(response => response.json())
        .then(tokenData => {
            if (!tokenData.access_token) {
                throw new Error('Access token not found in response');
            }
            accessToken = tokenData.access_token;

            return getLocationCoordinates(location);
        })
        .then(coords => {
            // Ensure `coords` has latitude and longitude
            if (!coords || !coords.latitude || !coords.longitude) {
                throw new Error('Invalid coordinates received');
            }

            const { latitude, longitude } = coords;
            const getHotelsByCoordinatesUrlWithParams = `${getHotelsByCoordinatesUrl}&latitude=${latitude}&longitude=${longitude}&radius=5&radiusUnit=KM&hotelSource=ALL`;

            return fetch(getHotelsByCoordinatesUrlWithParams, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
        })
        .then(response => response.json())
        .then(hotelsData => {
            const resultsTableBody = document.querySelector('#results tbody');
            resultsTableBody.innerHTML = '';

            if (hotelsData && hotelsData.data && hotelsData.data.length > 0) {
                internalHotelIds = hotelsData.data.map(hotel => hotel.hotelId); // Store hotel IDs for later use
                let hotelIds = internalHotelIds.slice(0, limitResults); // Limit hotel IDs for fetching offers
                return fetchHotelOffers(hotelIds);
            } else {
                document.getElementById('resultsBox').style.display = 'block';
                resultsTableBody.innerHTML = '<tr><td colspan="4">No hotels found</td></tr>'; // Updated colspan to 4
            }
        })
        .then(data => {
            const resultsTableBody = document.querySelector('#results tbody');
            resultsTableBody.innerHTML = '';

            if (data.data && data.data.length > 0) {
                data.data.forEach(offer => {
                    const row = document.createElement('tr');

                    // Add hotel name cell
                    const nameCell = document.createElement('td');
                    nameCell.textContent = formatHotelName(offer.hotel.name) || 'N/A'; // Format hotel name
                    row.appendChild(nameCell);

                    // Add room type cell
                    const roomTypeCell = document.createElement('td');
                    const roomType = offer.offers[0].room ? formatRoomType(offer.offers[0].room.typeEstimated.category) : 'N/A'; // Use formatted room type
                    roomTypeCell.textContent = roomType;
                    row.appendChild(roomTypeCell);

                    // Add price cell
                    const priceCell = document.createElement('td');
                    const price = offer.offers[0].price ? `${offer.offers[0].price.currency} ${offer.offers[0].price.total}` : 'N/A'; // Adjust according to actual data
                    priceCell.textContent = price;
                    row.appendChild(priceCell);

                    // Add distance cell
                    const distanceCell = document.createElement('td');
                    const hotelLat = offer.hotel.latitude;
                    const hotelLon = offer.hotel.longitude;
                    const distance = calculateDistance(locationCoordinates.latitude, locationCoordinates.longitude, hotelLat, hotelLon);
                    distanceCell.textContent = `${distance} km`;
                    row.appendChild(distanceCell);

                    resultsTableBody.appendChild(row);
                });
            } else {
                resultsTableBody.innerHTML = '<tr><td colspan="4">No results found</td></tr>'; // Updated colspan to 4
            }

            document.getElementById('resultsBox').style.display = 'block';
        })
        .catch(error => {
            console.error('Error:', error.message);
            document.getElementById('resultsBox').style.display = 'block';
            document.querySelector('#results tbody').innerHTML = `<tr><td colspan="4">An error occurred: ${error.message}. Please try again.</td></tr>`; // Updated colspan to 4
        });
});
