document.getElementById('searchForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const location = document.getElementById('location').value;
    const checkInDate = document.getElementById('checkInDate').value;
    const checkOutDate = document.getElementById('checkOutDate').value;
    const adults = document.getElementById('adults').value;
    const numberOfRooms = document.getElementById('numberOfRooms').value;
    const email = document.getElementById('email').value;
    const limitResults = parseInt(document.getElementById('limitResults').value, 10);
    const formCurrency = document.getElementById('currency').value; // Get form currency
    const priceLimit = parseFloat(document.getElementById('priceLimit').value); // Get priceLimit and convert to float

    console.log('Form Data:', {
        location,
        checkInDate,
        checkOutDate,
        adults,
        numberOfRooms,
        email,
        formCurrency,
        priceLimit
    });

    const getAccessTokenUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetAmadeusAccessToken?code=8-Ok9mpy3X22aWVQSXBs_djXz57bJvh23XJAPuY-yH9jAzFu8nDFaA%3D%3D';
    const getHotelsByCoordinatesUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelsByCoordinates?code=_9_S3ATWEtYncsW6pzX2gKatTmRWbkHKc9O2GsD-74BqAzFupvm9kA%3D%3D';
    const getHotelOffersUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelOffers?code=N5p8k9qzS_NgW_h2mHWm_xKOpPHY2Cjb_nh_TCturrA5AzFuCXBy-g%3D%3D';
    const getCoordinatesByLocationUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetCoordinatesByLocation?code=tyHMhU1QpcgHHWUrwfor8PtyYEzW-keeu2daJnRQqdQxAzFuPgYxzA%3D%3D';
    const sheetyUrl = 'https://hotelfunctionapp.azurewebsites.net/api/SendDataToSheety?code=WB185Wd0xWtqP1DMGlKF1WnHLt8TXwpm8QXDzTlulg6FAzFuFvQ-2A%3D%3D'; // Sheety URL
    const conversionApiUrl = 'https://v6.exchangerate-api.com/v6/0fdee0a5645b6916b5a20bb3/latest/'; // Your API URL

    let accessToken;
    let internalHotelIds = []; // Store hotel IDs for later use
    let locationCoordinates; // Store coordinates of the searched location
    let selectedHotels = []; // Store selected hotel data

    function convertCurrency(amount, fromCurrency, toCurrency) {
        const url = `${conversionApiUrl}${fromCurrency}`;

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                const rate = data.conversion_rates[toCurrency];
                if (!rate) {
                    throw new Error(`No conversion rate available for ${toCurrency}`);
                }
                return amount * rate;
            });
    }

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

    function fetchHotelOffers(validHotelIds, priceLimit) {
        const limitedHotelIds = validHotelIds.slice(0, limitResults);
        const params = `hotelIds=${limitedHotelIds.join(',')}&adults=${adults}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&roomQuantity=${numberOfRooms}&paymentPolicy=NONE&bestRateOnly=true&currency=${formCurrency}&priceRange=-${priceLimit}&includeClosed=false`; 
        const url = `${getHotelOffersUrl}&params=${encodeURIComponent(params)}`;
    
        console.log('Fetching hotel offers with params:', params);
    
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

    function convertPricesToFormCurrency(hotelOffers, originalCurrency) {
        return Promise.all(hotelOffers.map(offer => {
            const price = offer.offers[0].price.total;
            if (originalCurrency !== formCurrency) {
                return convertCurrency(price, originalCurrency, formCurrency)
                    .then(convertedPrice => {
                        offer.offers[0].price.total = convertedPrice.toFixed(2); // Update with converted price
                        offer.offers[0].price.currency = formCurrency; // Update currency
                        return offer;
                    });
            } else {
                return offer; // No conversion needed if currency matches
            }
        }));
    }

    function submitToSheety(formData, formattedData) {
        const data = {
            ...formData,
            ...formattedData
        };

        return fetch(sheetyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            console.log('Sheety response:', result);
            return result;
        })
        .catch(error => {
            console.error('Error sending data to Sheety:', error.message);
        });
    }

    function handleCheckboxChange() {
        const checkboxes = document.querySelectorAll('#results tbody input[type="checkbox"]');
        const checkedCheckboxes = Array.from(checkboxes).filter(checkbox => checkbox.checked);

        if (checkedCheckboxes.length > 3) {
            alert('You can only select up to 3 hotels.');
            this.checked = false; // Uncheck the box if the limit is exceeded
        } else {
            // Update selectedHotels with selected data
            selectedHotels = checkedCheckboxes.map(checkbox => {
                const row = checkbox.closest('tr');
                return {
                    hotel: row.querySelector('.hotel').textContent,
                    hotelId: row.querySelector('.hiddenHotelId').textContent,
                    roomType: row.querySelector('.roomType').textContent,
                    price: row.querySelector('.price').textContent
                };
            });
        }
    }

    function formatHotelName(name) {
        return name
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    function formatRoomType(roomType) {
        return roomType
            .toUpperCase()            // Convert the whole string to uppercase
            .replace(/_/g, ' ')       // Replace underscores with spaces
            .toLowerCase()            // Convert the whole string to lowercase
            .split(' ')               // Split the string into words
            .map(word =>              // Capitalize the first letter of each word
                word.charAt(0).toUpperCase() + word.slice(1)
            )
            .join(' ');               // Join the words back together with a space
    }
    

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance.toFixed(2); // Distance in km
    }

    document.getElementById('submitToSheet').addEventListener('click', function() {
        const formData = {
            location,
            checkInDate,
            checkOutDate,
            adults,
            numberOfRooms,
            email,
            currency: formCurrency,
            priceLimit
        };

        const formattedData = {
            selectedHotels
        };

        submitToSheety(formData, formattedData)
            .then(result => {
                if (result) {
                    alert('Data successfully sent to Sheety.');
                }
            });
    });

    document.querySelectorAll('#results input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });

    fetch(getAccessTokenUrl)
        .then(response => response.json())
        .then(tokenData => {
            accessToken = tokenData.access_token;
            return getLocationCoordinates(location);
        })
        .then(coords => {
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
                
                // Fetch hotel offers
                return fetchHotelOffers(hotelIds, priceLimit);
            } else {
                document.getElementById('resultsBox').style.display = 'block';
                resultsTableBody.innerHTML = '<tr><td colspan="5">No hotels found</td></tr>'; // Updated colspan to 5
            }
        })
        .then(data => {
            // Extract the original currency from the response
            const originalCurrency = data.data[0]?.offers[0]?.price?.currency || formCurrency;

            // Convert prices to form currency
            return convertPricesToFormCurrency(data.data, originalCurrency);
        })
        .then(data => {
            const resultsTableBody = document.querySelector('#results tbody');
            resultsTableBody.innerHTML = '';

            if (data && data.length > 0) {
                data.forEach(offer => {
                    const row = document.createElement('tr');

                    // Add hidden hotelId cell
                    const hiddenIdCell = document.createElement('td');
                    hiddenIdCell.className = 'hiddenHotelId';
                    hiddenIdCell.textContent = offer.hotel.hotelId;
                    hiddenIdCell.style.display = 'none'; // Hide the cell
                    row.appendChild(hiddenIdCell);

                    // Add checkbox cell
                    const checkboxCell = document.createElement('td');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'select-checkbox';
                    checkboxCell.appendChild(checkbox);
                    row.appendChild(checkboxCell);

                    // Add hotel name cell
                    const nameCell = document.createElement('td');
                    nameCell.textContent = formatHotelName(offer.hotel.name) || 'N/A'; // Format hotel name
                    nameCell.className = 'hotel';
                    row.appendChild(nameCell);

                    // Add room type cell
                    const roomTypeCell = document.createElement('td');
                    const roomType = offer.offers[0].room ? formatRoomType(offer.offers[0].room.typeEstimated.category) : 'N/A'; // Use formatted room type
                    roomTypeCell.textContent = roomType;
                    roomTypeCell.className = 'roomType';
                    row.appendChild(roomTypeCell);

                    // Add price cell
                    const priceCell = document.createElement('td');
                    const price = offer.offers[0].price ? `${offer.offers[0].price.currency} ${offer.offers[0].price.total}` : 'N/A'; // Adjust according to actual data
                    priceCell.textContent = price;
                    priceCell.className = 'price';
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
                resultsTableBody.innerHTML = '<tr><td colspan="5">No results found</td></tr>'; // Updated colspan to 5
            }

            document.getElementById('resultsBox').style.display = 'block';
        })
        .catch(error => {
            console.error('Error:', error.message);
            document.getElementById('resultsBox').style.display = 'block';
            document.querySelector('#results tbody').innerHTML = `<tr><td colspan="5">An error occurred: ${error.message}. Please try again.</td></tr>`; // Updated colspan to 5
        });
});
