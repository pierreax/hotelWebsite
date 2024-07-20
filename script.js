document.getElementById('searchForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const location = document.getElementById('location').value;
    const checkInDate = document.getElementById('checkInDate').value;
    const checkOutDate = document.getElementById('checkOutDate').value;
    const adults = document.getElementById('adults').value;
    const limitResults = parseInt(document.getElementById('limitResults').value, 10);

    const getAccessTokenUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetAmadeusAccessToken?code=8-Ok9mpy3X22aWVQSXBs_djXz57bJvh23XJAPuY-yH9jAzFu8nDFaA%3D%3D';
    const getHotelsByCoordinatesUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelsByCoordinates?code=_9_S3ATWEtYncsW6pzX2gKatTmRWbkHKc9O2GsD-74BqAzFupvm9kA%3D%3D';
    const getHotelOffersUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelOffers?code=N5p8k9qzS_NgW_h2mHWm_xKOpPHY2Cjb_nh_TCturrA5AzFuCXBy-g%3D%3D';
    const getCoordinatesByLocationUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetCoordinatesByLocation?code=tyHMhU1QpcgHHWUrwfor8PtyYEzW-keeu2daJnRQqdQxAzFuPgYxzA%3D%3D';

    let accessToken;
    let internalHotelIds = []; // Store hotel IDs for later use

    function getLocationCoordinates(location) {
        const url = `${getCoordinatesByLocationUrl}&location=${encodeURIComponent(location)}`;

        console.log('Coordinates URL:', url); // Debugging line

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                console.log('Coordinates response:', data); // Debugging line
                if (data.latitude && data.longitude) {
                    return {
                        lat: data.latitude,
                        lng: data.longitude
                    };
                } else {
                    throw new Error('Location coordinates not found');
                }
            });
    }

    function formatRoomType(type) {
        // Convert room type to a more readable format
        if (!type) return 'N/A';

        return type
            .replace(/_/g, ' ') // Replace underscores with spaces
            .toLowerCase() // Convert to lowercase
            .replace(/\b\w/g, char => char.toUpperCase()); // Capitalize first letter of each word
    }

    function fetchHotelOffers(validHotelIds) {
        const limitedHotelIds = validHotelIds.slice(0, limitResults);
        const url = `${getHotelOffersUrl}&hotelIds=${limitedHotelIds.join(',')}&adults=${adults}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&roomQuantity=1&paymentPolicy=NONE&bestRateOnly=true`;

        console.log('Fetching hotel offers with URL:', url);

        return fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
        .then(response => response.text())
        .then(text => {
            console.log('Hotel offers response text:', text); // Log the raw response text
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
            const { lat, lng } = coords;
            const getHotelsByCoordinatesUrlWithParams = `${getHotelsByCoordinatesUrl}&latitude=${lat}&longitude=${lng}&radius=5&radiusUnit=KM&hotelSource=ALL`;

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
                resultsTableBody.innerHTML = '<tr><td colspan="3">No hotels found</td></tr>'; // Updated colspan to 3
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
                    nameCell.textContent = offer.hotel.name || 'N/A'; // Default to 'N/A' if name is missing
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

                    resultsTableBody.appendChild(row);
                });
            } else {
                resultsTableBody.innerHTML = '<tr><td colspan="3">No results found</td></tr>'; // Updated colspan to 3
            }

            document.getElementById('resultsBox').style.display = 'block';
        })
        .catch(error => {
            console.error('Error:', error.message);
            document.getElementById('resultsBox').style.display = 'block';
            document.querySelector('#results tbody').innerHTML = `<tr><td colspan="3">An error occurred: ${error.message}. Please try again.</td></tr>`; // Updated colspan to 3
        });
});
